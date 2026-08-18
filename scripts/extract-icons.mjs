#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Портирование набора иконок из соро-фронта (§4.2: «Собственный SVG-набор,
 * портируется из soro_front/src/components/icons.jsx. Никаких сторонних
 * icon-пакетов»).
 *
 * Репозиторий веба нам не дали, поэтому набор снят с продакшена: в
 * скомпилированном бандле sorollm.tj объект Icons и базовый компонент Ic
 * сохранились целиком, включая имена иконок и толщины обводки.
 *
 * Скрипт разбирает этот объект и генерирует src/design/iconPaths.ts —
 * обычную таблицу примитивов. Дальше её рисует react-native-svg.
 *
 * Использование:
 *   node scripts/extract-icons.mjs <путь к icons-src.js> [выходной файл]
 *
 * Запускается разово: результат коммитится, и приложение при сборке никуда
 * не ходит. Скрипт остаётся, чтобы повторить портирование, когда дадут
 * настоящий icons.jsx, и увидеть разницу.
 */

const input = process.argv[2];
const output = process.argv[3] ?? 'src/design/iconPaths.ts';

if (!input) {
  console.error('Укажите файл с объектом Icons={...}');
  process.exit(1);
}

const source = readFileSync(input, 'utf8');

/** Базовые значения компонента Ic из бандла — их нельзя терять при переносе. */
const DEFAULT_STROKE_WIDTH = 1.8;
const VIEW_BOX = '0 0 24 24';

/**
 * Границы каждой иконки. Разбираем не регулярками по всему файлу, а по
 * одному определению: у иконок разная форма (у одних d, у других вложенные
 * circle и rect), и общий шаблон на всех тихо терял бы половину.
 */
function splitDefinitions(text) {
  const body = text.slice(text.indexOf('{') + 1, text.lastIndexOf('}'));
  const entries = [];
  const nameRe = /(^|,)([A-Za-z0-9_]+):\s*\w+\s*=>/g;

  let match;
  const starts = [];
  while ((match = nameRe.exec(body))) {
    starts.push({ name: match[2], from: match.index + match[1].length });
  }

  for (let i = 0; i < starts.length; i += 1) {
    const to = i + 1 < starts.length ? starts[i + 1].from : body.length;
    entries.push({ name: starts[i].name, source: body.slice(starts[i].from, to) });
  }
  return entries;
}

function parseShapes(text) {
  const shapes = [];

  // Порядок обхода — по позиции в исходнике: у иконок вроде search сначала
  // окружность, потом штрих ручки, и менять их местами нельзя.
  const re =
    /jsxRuntimeExports\.jsx\(\s*"(path|circle|rect|line)"\s*,\s*\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(text))) {
    const [, kind, attrs] = match;
    const get = (key) => {
      const found = new RegExp(`(?:^|,)\\s*${key}\\s*:\\s*"([^"]*)"`).exec(attrs);
      return found ? found[1] : null;
    };

    if (kind === 'path') {
      const d = get('d');
      if (d) shapes.push({ kind: 'path', d });
    } else if (kind === 'circle') {
      shapes.push({ kind: 'circle', cx: get('cx'), cy: get('cy'), r: get('r') });
    } else if (kind === 'rect') {
      shapes.push({
        kind: 'rect',
        x: get('x'),
        y: get('y'),
        width: get('width'),
        height: get('height'),
        rx: get('rx'),
      });
    } else {
      shapes.push({
        kind: 'line',
        x1: get('x1'),
        y1: get('y1'),
        x2: get('x2'),
        y2: get('y2'),
      });
    }
  }

  return shapes;
}

/**
 * Логотип Google в набор не берём по двум причинам: §8.2 запрещает вход через
 * Google в приложении, а его четыре дольки раскрашены каждая своим fill —
 * одноцветный компонент их всё равно передать не может.
 */
const SKIP = new Set(['google']);

const icons = [];

for (const entry of splitDefinitions(source)) {
  if (SKIP.has(entry.name)) continue;

  // Прямая форма: d передан аргументом Ic, а не вложенным элементом.
  const inlineD = /\.\.\.\w+\s*,\s*d:\s*"([^"]+)"/.exec(entry.source);
  const shapes = inlineD ? [{ kind: 'path', d: inlineD[1] }] : parseShapes(entry.source);

  const sw = /sw:\s*([0-9.]+)/.exec(entry.source);
  const fill = /fill:\s*"([^"]+)"/.exec(entry.source);

  if (shapes.length === 0) {
    console.warn(`  ! ${entry.name}: не найдено ни одной фигуры, пропущена`);
    continue;
  }

  icons.push({
    name: entry.name,
    shapes,
    strokeWidth: sw ? Number(sw[1]) : DEFAULT_STROKE_WIDTH,
    fill: fill ? fill[1] : null,
  });
}

icons.sort((a, b) => a.name.localeCompare(b.name));

const lines = [
  '/**',
  ' * Набор иконок (§4.2: «Собственный SVG-набор, портируется из',
  ' * soro_front/src/components/icons.jsx. Никаких сторонних icon-пакетов»).',
  ' *',
  ' * ФАЙЛ СГЕНЕРИРОВАН: scripts/extract-icons.mjs. Руками не править.',
  ' *',
  ' * Репозиторий веба не предоставлен, поэтому набор снят с продакшена —',
  ' * объект Icons сохранился в бандле sorollm.tj целиком, вместе с именами и',
  ' * толщинами обводки. Значения по умолчанию взяты у тамошнего компонента Ic:',
  ` * размер 20, strokeWidth ${DEFAULT_STROKE_WIDTH}, fill none, стык и конец линии — round.`,
  ' */',
  '',
  "export const ICON_VIEW_BOX = '" + VIEW_BOX + "';",
  `export const ICON_STROKE_WIDTH = ${DEFAULT_STROKE_WIDTH};`,
  '',
  'export type IconShape =',
  "  | { kind: 'path'; d: string }",
  "  | { kind: 'circle'; cx: string; cy: string; r: string }",
  "  | { kind: 'rect'; x: string; y: string; width: string; height: string; rx: string | null }",
  "  | { kind: 'line'; x1: string; y1: string; x2: string; y2: string };",
  '',
  'export type IconDefinition = {',
  '  shapes: readonly IconShape[];',
  '  /** Своя толщина обводки там, где она отличается от базовой. */',
  '  strokeWidth?: number;',
  '  /** Залитые иконки (fill вместо stroke) — обводка тогда не рисуется. */',
  '  fill?: string;',
  '};',
  '',
  'export const ICONS = {',
];

/**
 * Иконки, которые мы рисуем сами, а не берём из бандла.
 *
 * ЗАЧЕМ. Шестерёнка на проде задана цепочкой из двадцати дуг вида
 * `a2 2 0 1 1 -2.8 2.8`. В вебе она стоит крупно и выглядит нормально, а в
 * приложении рисуется на 20 px обводкой 1.8 — зубцы получаются разной длины,
 * контур виляет, и на устройстве это читается как «кривая иконка». Проверено
 * скриншотом с эмулятора: подвал drawer, шестерёнка рядом с почтой.
 *
 * Здесь она построена геометрией: восемь зубцов через 45°, вершины на радиусе
 * 9.2, впадины на 6.3, дуги настоящие. Симметрия гарантирована построением, а
 * не удачей округления. Центральное отверстие оставлено прежним — оно и в
 * бандле обычный круг r=3.
 *
 * Переопределение живёт ЗДЕСЬ, а не в сгенерированном файле: иначе следующий
 * прогон скрипта молча вернул бы кривой вариант.
 */
const SHAPE_OVERRIDES = {
  settings: {
    why: 'построена геометрией: дуги из бандла разъезжаются на 20 px (см. SHAPE_OVERRIDES)',
    shapes: [
      { kind: 'circle', cx: '12', cy: '12', r: '3' },
      {
        kind: 'path',
        d:
          'M10.09 3A9.2 9.2 0 0 1 13.91 3L13.36 5.85A6.3 6.3 0 0 1 15.38 6.69L17.01 4.28' +
          'A9.2 9.2 0 0 1 19.72 6.99L17.31 8.62A6.3 6.3 0 0 1 18.15 10.64L21 10.09' +
          'A9.2 9.2 0 0 1 21 13.91L18.15 13.36A6.3 6.3 0 0 1 17.31 15.38L19.72 17.01' +
          'A9.2 9.2 0 0 1 17.01 19.72L15.38 17.31A6.3 6.3 0 0 1 13.36 18.15L13.91 21' +
          'A9.2 9.2 0 0 1 10.09 21L10.64 18.15A6.3 6.3 0 0 1 8.62 17.31L6.99 19.72' +
          'A9.2 9.2 0 0 1 4.28 17.01L6.69 15.38A6.3 6.3 0 0 1 5.85 13.36L3 13.91' +
          'A9.2 9.2 0 0 1 3 10.09L5.85 10.64A6.3 6.3 0 0 1 6.69 8.62L4.28 6.99' +
          'A9.2 9.2 0 0 1 6.99 4.28L8.62 6.69A6.3 6.3 0 0 1 10.64 5.85Z',
      },
    ],
  },
};

for (const icon of icons) {
  const override = SHAPE_OVERRIDES[icon.name];
  if (override) icon.shapes = override.shapes;

  const shapes = icon.shapes
    .map((shape) => {
      if (shape.kind === 'path') return `{ kind: 'path', d: ${JSON.stringify(shape.d)} }`;
      if (shape.kind === 'circle') {
        return `{ kind: 'circle', cx: '${shape.cx}', cy: '${shape.cy}', r: '${shape.r}' }`;
      }
      if (shape.kind === 'rect') {
        return (
          `{ kind: 'rect', x: '${shape.x}', y: '${shape.y}', width: '${shape.width}', ` +
          `height: '${shape.height}', rx: ${shape.rx === null ? 'null' : `'${shape.rx}'`} }`
        );
      }
      return `{ kind: 'line', x1: '${shape.x1}', y1: '${shape.y1}', x2: '${shape.x2}', y2: '${shape.y2}' }`;
    })
    .join(',\n      ');

  if (override) lines.push(`  /** Не из бандла: ${override.why}. */`);
  lines.push(`  ${icon.name}: {`);
  lines.push('    shapes: [');
  lines.push(`      ${shapes},`);
  lines.push('    ],');
  if (icon.strokeWidth !== DEFAULT_STROKE_WIDTH) lines.push(`    strokeWidth: ${icon.strokeWidth},`);
  if (icon.fill && icon.fill !== 'none') lines.push(`    fill: '${icon.fill}',`);
  lines.push('  },');
}

lines.push('} as const satisfies Record<string, IconDefinition>;');
lines.push('');
lines.push('export type IconName = keyof typeof ICONS;');
lines.push('');

writeFileSync(output, lines.join('\n'), 'utf8');
console.log(`Портировано иконок: ${icons.length} → ${output}`);
console.log(icons.map((i) => i.name).join(' '));
