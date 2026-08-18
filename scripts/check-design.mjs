#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Сверка дизайн-токенов с продакшеном (§17: «экраны визуально совпадают с
 * sorollm.tj»).
 *
 * Приложение B ТЗ задаёт палитру, но источник истины — то, что реально
 * крутится на сайте: там дизайн правят без обновления документа. Скрипт
 * скачивает скомпилированный CSS и сверяет с src/design/tokens.ts.
 *
 * Падает, если значение разошлось или пропало. Проверить можно и без сети:
 *   node scripts/check-design.mjs --css <файл>
 *
 * Проверяются цвета, тени, стёкла и рамки — то, что задаётся переменными CSS.
 * Отступы и размеры так не снять: в вебе они разложены по классам Tailwind.
 */

const SITE = 'https://www.sorollm.tj/';
const TOKENS = 'src/design/tokens.ts';

/**
 * Соответствие переменной CSS и поля токенов. Тема указана явно: в CSS
 * светлая и тёмная объявлены разными блоками с одинаковыми именами.
 */
const MAP = [
  ['--ruby-300', 'ruby.r300'],
  ['--ruby-400', 'ruby.r400'],
  ['--ruby-500', 'ruby.r500'],
  ['--ruby-600', 'ruby.r600'],
  ['--ruby-700', 'ruby.r700'],
  ['--ruby-800', 'ruby.r800'],
  ['--bg-0', 'dark.bg0', 'dark'],
  ['--bg-1', 'dark.bg1', 'dark'],
  ['--bg-2', 'dark.bg2', 'dark'],
  ['--bg-3', 'dark.bg3', 'dark'],
  ['--bg-4', 'dark.bg4', 'dark'],
  ['--text', 'dark.text', 'dark'],
  ['--text-2', 'dark.text2', 'dark'],
  ['--text-3', 'dark.text3', 'dark'],
  ['--border', 'dark.border', 'dark'],
  ['--border-strong', 'dark.borderStrong', 'dark'],
  ['--surface-glass', 'dark.surfaceGlass', 'dark'],
  ['--ruby-soft', 'dark.rubySoft', 'dark'],
  ['--ruby-soft-2', 'dark.rubySoft2', 'dark'],
  ['--bg-0', 'light.bg0', 'light'],
  ['--bg-1', 'light.bg1', 'light'],
  ['--bg-2', 'light.bg2', 'light'],
  ['--bg-3', 'light.bg3', 'light'],
  ['--bg-4', 'light.bg4', 'light'],
  ['--text', 'light.text', 'light'],
  ['--text-2', 'light.text2', 'light'],
  ['--text-3', 'light.text3', 'light'],
  ['--border', 'light.border', 'light'],
  ['--border-strong', 'light.borderStrong', 'light'],
  ['--surface-glass', 'light.surfaceGlass', 'light'],
  ['--ruby-soft', 'light.rubySoft', 'light'],
  ['--ruby-soft-2', 'light.rubySoft2', 'light'],
];

/**
 * Тени сверяются отдельно: в CSS это одна строка `0 8px 40px -8px rgba(...)`,
 * а в RN — четыре поля, потому что spread (-8px) в React Native не выражается
 * вообще. Сопоставляем то, что переносимо: смещение, размытие и цвет.
 */
const SHADOWS = [
  ['--shadow-lg', 'dark.shadowLg', 'dark'],
  ['--shadow-md', 'dark.shadowMd', 'dark'],
  ['--shadow-glow', 'dark.shadowGlow', 'dark'],
  ['--shadow-lg', 'light.shadowLg', 'light'],
  ['--shadow-md', 'light.shadowMd', 'light'],
  ['--shadow-glow', 'light.shadowGlow', 'light'],
];

async function loadCss() {
  const fileArg = process.argv.indexOf('--css');
  if (fileArg !== -1) return readFileSync(process.argv[fileArg + 1], 'utf8');

  const page = await fetch(SITE).then((r) => r.text());
  const href = /\/assets\/index-[A-Za-z0-9_-]+\.css/.exec(page);
  if (!href) throw new Error('не нашёл ссылку на CSS на странице сайта');
  return fetch(new URL(href[0], SITE)).then((r) => r.text());
}

/**
 * Значения переменных по темам. В CSS тёмная объявлена первой (это :root),
 * светлая — следующим блоком с [data-theme="light"]; поэтому просто берём
 * первое и второе вхождение.
 */
function readCssTokens(css) {
  const byTheme = { dark: new Map(), light: new Map() };

  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;}]+)/g)) {
    const name = match[1];
    const value = match[2].trim();
    if (!byTheme.dark.has(name)) byTheme.dark.set(name, value);
    else if (!byTheme.light.has(name)) byTheme.light.set(name, value);
  }

  return byTheme;
}

/**
 * Одно и то же значение записывается по-разному: `rgba(20, 8, 12, .09)` и
 * `rgba(20,8,12,0.09)`, `.1` и `0.10`. Числа приводим через parseFloat, иначе
 * проверка ловит различия в записи и выдаёт их за расхождения дизайна.
 */
function normalize(value) {
  return String(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/-?(?:\d+\.?\d*|\.\d+)/g, (n) => String(parseFloat(n)));
}

function readTokens(source) {
  const values = new Map();

  // ruby — плоский объект в начале файла.
  const rubyBlock = /export const ruby = \{([\s\S]*?)\} as const;/.exec(source);
  if (rubyBlock) {
    for (const m of rubyBlock[1].matchAll(/(\w+):\s*'([^']+)'/g)) {
      values.set(`ruby.${m[1]}`, m[2]);
    }
  }

  for (const theme of ['dark', 'light']) {
    const block = new RegExp(`const ${theme} = \\{([\\s\\S]*?)\\} as const;`).exec(source);
    if (!block) continue;

    for (const m of block[1].matchAll(/(\w+):\s*'([^']+)'/g)) {
      values.set(`${theme}.${m[1]}`, m[2]);
    }
    // Тени — объекты, а не строки.
    for (const m of block[1].matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
      const fields = {};
      for (const f of m[2].matchAll(/(\w+):\s*'?([^,'\s]+)'?/g)) fields[f[1]] = f[2];
      values.set(`${theme}.${m[1]}`, fields);
    }
  }

  return values;
}

const css = await loadCss();
const cssTokens = readCssTokens(css);
const tokens = readTokens(readFileSync(TOKENS, 'utf8'));

const problems = [];
let checked = 0;

for (const [cssName, tokenPath, theme = 'dark'] of MAP) {
  const expected = cssTokens[theme].get(cssName);
  const actual = tokens.get(tokenPath);

  if (expected === undefined) {
    problems.push(`${cssName} (${theme}) больше нет в CSS сайта — токен ${tokenPath} устарел`);
    continue;
  }
  if (actual === undefined) {
    problems.push(`${tokenPath} отсутствует в ${TOKENS}, а в CSS есть: ${expected}`);
    continue;
  }

  checked += 1;
  if (normalize(String(actual)) !== normalize(expected)) {
    problems.push(`${tokenPath}: у нас ${actual}, на сайте ${expected}`);
  }
}

for (const [cssName, tokenPath, theme] of SHADOWS) {
  const expected = cssTokens[theme].get(cssName);
  const actual = tokens.get(tokenPath);
  if (expected === undefined || typeof actual !== 'object') {
    problems.push(`${tokenPath}: не с чем сверять (${cssName}, ${theme})`);
    continue;
  }

  checked += 1;
  /**
   * `0 8px 40px -8px rgba(229,16,63,.45)` → сдвиг по X, сдвиг по Y, размытие,
   * растяжение, цвет. Первое значение записано без единиц («0», а не «0px») —
   * поэтому px необязателен, иначе разбор молча съезжает на одну позицию и
   * выдаёт смещение за размытие.
   */
  const parts = /(-?[\d.]+)(?:px)?\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+rgba\(([^)]+)\)/.exec(
    expected,
  );
  if (!parts) {
    problems.push(`${tokenPath}: не разобрал значение CSS «${expected}»`);
    continue;
  }

  const offsetY = Number(parts[2]);
  const blur = Number(parts[3]);
  const opacity = parseFloat(parts[5].split(',').pop().trim());

  if (Number(actual.offsetY) !== offsetY) {
    problems.push(`${tokenPath}.offsetY: у нас ${actual.offsetY}, на сайте ${offsetY}`);
  }
  if (Number(actual.radius) !== blur) {
    problems.push(`${tokenPath}.radius: у нас ${actual.radius}, на сайте размытие ${blur}`);
  }
  if (Math.abs(Number(actual.opacity) - opacity) > 0.001) {
    problems.push(`${tokenPath}.opacity: у нас ${actual.opacity}, на сайте ${opacity}`);
  }
}

if (process.argv.includes('--save-css')) {
  writeFileSync('docs/site.css', css, 'utf8');
  console.log('CSS сайта сохранён в docs/site.css');
}

console.log(`Сверено значений: ${checked}`);

if (problems.length > 0) {
  console.error('\nРасхождения с sorollm.tj:');
  for (const problem of problems) console.error(`  ✖ ${problem}`);
  process.exit(1);
}

console.log('Дизайн-токены совпадают с продакшеном.');
