/**
 * Превращение TeX в SVG (§7.6, §4.2).
 *
 * ПОЧЕМУ НЕ ГОТОВЫЙ КОМПОНЕНТ react-native-mathjax-svg
 * Библиотека из §4.2 используется, но берётся из неё только вендорная копия
 * MathJax. Её собственный компонент подключает AllPackages — ВСЕ расширения
 * TeX разом, включая физику частиц, химию и диаграммы. Замер: бандл вырастал
 * с 4.1 до 6.1 МБ. Здесь подключены только те пакеты, которые реально нужны
 * школьной математике и физике.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫМ МОДУЛЕМ БЕЗ REACT
 * Преобразование — чистая функция от строки, и в таком виде она проверяется
 * тестами в node: MathJax целиком на JS, нативного кода в нём нет. Формулы
 * приходят от модели, то есть их содержимое непредсказуемо, и «падает ли
 * рендер на кривой формуле» — вопрос, на который нужен ответ до релиза.
 */

/**
 * Набор расширений TeX. base и ams покрывают дроби, корни, интегралы, суммы,
 * матрицы, греческие буквы и знаки сравнения — это и есть школьный курс.
 *
 * noerrors и noundefined добавлены намеренно: без них незнакомая команда
 * бросает исключение, и одна кривая формула из ответа модели уронила бы
 * весь экран чата. С ними MathJax рисует исходный текст формулы как есть.
 */
const PACKAGES = ['base', 'ams', 'noerrors', 'noundefined'];

type MathDocument = {
  convert(tex: string, options: { display: boolean; em: number; ex: number }): unknown;
};

let engine: { document: MathDocument; adaptor: { outerHTML(node: unknown): string } } | null = null;

/**
 * Ленивая инициализация — намеренно через require, а не import сверху файла.
 *
 * §12 требует холодный старт меньше 2.5 с на Redmi 9A. Модули MathJax
 * исполняются при первом же обращении к ним, а это заметная работа: разбор
 * таблиц шрифтов и регистрация расширений TeX. Статический import выполнил
 * бы её при запуске приложения — то есть у КАЖДОГО пользователя, включая тех,
 * кто ни одной формулы за сессию не увидит.
 *
 * Здесь она откладывается до первой формулы в ответе модели. На размер бандла
 * это не влияет — код всё равно внутри, — но убирается со старта.
 */
function getEngine() {
  if (engine) return engine;

  const { mathjax } = require('react-native-mathjax-svg/mathjax/es5/js/mathjax.js');
  const { TeX } = require('react-native-mathjax-svg/mathjax/es5/js/input/tex.js');
  const { SVG } = require('react-native-mathjax-svg/mathjax/es5/js/output/svg.js');
  const { liteAdaptor } = require('react-native-mathjax-svg/mathjax/es5/js/adaptors/liteAdaptor.js');
  const {
    RegisterHTMLHandler,
  } = require('react-native-mathjax-svg/mathjax/es5/js/handlers/html.js');

  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);

  engine = {
    adaptor,
    document: mathjax.document('', {
      InputJax: new TeX({ packages: PACKAGES }),
      // fontCache: 'local' — повторяющиеся глифы описываются один раз на формулу.
      OutputJax: new SVG({ fontCache: 'local' }),
    }),
  };
  return engine;
}

/**
 * Кэш готовых SVG. Одна и та же формула перерисовывается при каждой смене
 * темы, размера шрифта и прокрутке списка, а преобразование заметно дороже
 * поиска по словарю.
 */
const cache = new Map<string, string>();
const CACHE_LIMIT = 200;

export type MathResult = {
  /** Разметка SVG или null, если формулу не удалось преобразовать. */
  svg: string | null;
  /** Ширина и высота в ex — MathJax отдаёт размеры именно в них. */
  width: number;
  height: number;
};

/** Размеры из атрибутов SVG. MathJax пишет их в ex, отсюда суффикс. */
function parseSize(svg: string): { width: number; height: number } {
  const width = /width="([\d.]+)ex"/.exec(svg);
  const height = /height="([\d.]+)ex"/.exec(svg);
  return {
    width: width ? Number(width[1]) : 0,
    height: height ? Number(height[1]) : 0,
  };
}

/**
 * Цвет подставляется на месте: MathJax рисует currentColor, которого в
 * react-native-svg нет — там нет каскада CSS, наследовать не от чего.
 */
export function applyColor(svg: string, color: string): string {
  return svg.replace(/currentColor/g, color);
}

export function texToSvg(tex: string, display: boolean): MathResult {
  const trimmed = tex.trim();
  if (trimmed.length === 0) return { svg: null, width: 0, height: 0 };

  const key = `${display ? 'd' : 'i'}:${trimmed}`;
  const cached = cache.get(key);
  if (cached !== undefined) return { svg: cached, ...parseSize(cached) };

  let svg: string;
  try {
    const { document, adaptor } = getEngine();
    const node = document.convert(trimmed, { display, em: 16, ex: 8 });
    // MathJax оборачивает результат в <mjx-container> — этот тег
    // react-native-svg не знает, оставляем только сам <svg>.
    svg = String(adaptor.outerHTML(node)).replace(
      /^[\s\S]*?(<svg[\s\S]*<\/svg>)[\s\S]*$/,
      '$1',
    );
  } catch {
    // Формула пришла от модели: сломать ей экран чата нельзя ни при каком
    // содержимом. Вызывающий код покажет исходный текст формулы.
    return { svg: null, width: 0, height: 0 };
  }

  if (!svg.startsWith('<svg')) return { svg: null, width: 0, height: 0 };

  // Простое вытеснение: словарь не должен расти без границы за долгую сессию.
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, svg);

  return { svg, ...parseSize(svg) };
}

/** Только для тестов: между проверками кэш не должен протекать. */
export function clearMathCache(): void {
  cache.clear();
}
