#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/**
 * §4.3 — правила по зависимостям.
 *
 * «Запрещены: рекламные SDK, аналитика с идентификацией устройства, любые
 * трекеры, библиотеки с неясной лицензией.»
 *
 * Проверка обязана уметь ПАДАТЬ, а не только красиво печатать. Падает она в
 * трёх случаях:
 *   1. лицензия зависимости не входит в разрешённый список (в том числе
 *      отсутствует или записана как SEE LICENSE IN — это и есть «неясная»);
 *   2. в дереве зависимостей встретился рекламный SDK или трекер;
 *   3. docs/THIRD_PARTY.md разошёлся с фактическим составом (запуск с --write
 *      обновляет файл).
 *
 * Проверяется всё дерево, а не только прямые зависимости: трекер приходит
 * транзитивно, через безобидный на вид пакет.
 */

const require = createRequire(import.meta.url);
const root = process.cwd();
const DOC = join(root, 'docs', 'THIRD_PARTY.md');

/** Разрешены только пермиссивные лицензии без обязательств по раскрытию кода. */
const ALLOWED = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'OFL-1.1',
  'MIT AND OFL-1.1',
  'BlueOak-1.0.0',
  'Python-2.0',
  '(MIT OR CC0-1.0)',
  '(MIT OR Apache-2.0)',
  '(BSD-2-Clause OR MIT OR Apache-2.0)',
  '(MIT AND Zlib)',
  '(MIT AND BSD-3-Clause)',
  'CC-BY-4.0',
]);

/**
 * Разобранные вручную исключения. Каждое — с причиной: §4.3 запрещает не
 * «непопулярные» лицензии, а НЕЯСНЫЕ, поэтому здесь фиксируется, почему
 * конкретная ясна и приемлема. Список короткий намеренно.
 */
const EXCEPTIONS = new Map([
  [
    'node-forge',
    'двойная лицензия BSD-3-Clause ИЛИ GPL-2.0 — выбираем BSD-3-Clause. ' +
      'Приходит из @expo/code-signing-certificates, в APK не попадает.',
  ],
  [
    'lightningcss',
    'MPL-2.0 (слабый копилефт на уровне файлов). Инструмент сборки из ' +
      '@expo/metro-config, компилирует CSS для веба; в мобильный бандл не входит.',
  ],
  [
    '@sentry/cli',
    'FSL-1.1-MIT — не открытая лицензия, а source-available: запрещает ' +
      'конкурировать с Sentry, через два года превращается в MIT. Это ' +
      'инструмент СБОРКИ: заливает source maps из gradle- и xcode-скриптов, ' +
      'в APK и в JS-бандл не входит. ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ ЮРИСТА, потому ' +
      'что §4.3 запрещает «библиотеки с неясной лицензией».',
  ],
  [
    'react-native-fit-image',
    'Beerware — разрешительная лицензия без обязательств. Приходит из ' +
      'react-native-markdown-display и ПОПАДАЕТ в приложение. Требует ' +
      'формального согласования по §4.3.',
  ],
]);

/**
 * Рекламные сети, трекеры и аналитика с идентификацией устройства.
 * Список намеренно грубый: совпадение — повод разбираться вручную, а не
 * молча пропускать.
 */
const FORBIDDEN_PATTERNS = [
  /^react-native-google-mobile-ads/,
  /^react-native-fbsdk/,
  /^@react-native-firebase\/analytics/,
  /^appsflyer/i,
  /^react-native-appsflyer/,
  /^@amplitude\//,
  /^amplitude-js$/,
  /^mixpanel/,
  /^react-native-branch/,
  /^@segment\//,
  /^analytics-react-native/,
  /^react-native-idfa/,
  /^react-native-device-info$/,
  /^react-native-advertising-id/,
  /^adjust/i,
  /^react-native-adjust/,
  /^onesignal/i,
  /^react-native-onesignal/,
  /^facebook-android-sdk/,
  /^react-native-appmetrica/,
  /yandex.*metrica/i,
];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Поиск папки пакета.
 *
 * require.resolve('<name>/package.json') работает не всегда: у пакетов с полем
 * exports путь ./package.json часто не экспортирован, и резолв падает. Поэтому
 * основной способ — обычный подъём по node_modules, как это делает сам Node,
 * а require.resolve оставлен запасным.
 */
function resolvePackage(name, from) {
  let dir = from;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  try {
    return dirname(require.resolve(`${name}/package.json`, { paths: [from] }));
  } catch {
    return null;
  }
}

/** Обход всего дерева: транзитивный трекер опаснее прямого — его не ждёшь. */
function collectTree() {
  const pkg = readJson(join(root, 'package.json'));
  const seen = new Map();
  const queue = Object.keys(pkg.dependencies ?? {}).map((name) => ({ name, from: root }));

  while (queue.length > 0) {
    const { name, from } = queue.shift();
    if (seen.has(name)) continue;

    const dir = resolvePackage(name, from);
    if (!dir) {
      seen.set(name, { name, version: '?', license: 'НЕ УСТАНОВЛЕН', homepage: '' });
      continue;
    }

    const meta = readJson(join(dir, 'package.json'));
    seen.set(name, {
      name,
      version: meta.version ?? '?',
      license: normalizeLicense(meta),
      homepage: meta.homepage ?? '',
      direct: from === root,
    });

    for (const dep of Object.keys(meta.dependencies ?? {})) {
      if (!seen.has(dep)) queue.push({ name: dep, from: dir });
    }
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeLicense(meta) {
  if (typeof meta.license === 'string') return meta.license;
  // Форма из старых пакетов: { type, url }.
  if (meta.license && typeof meta.license.type === 'string') return meta.license.type;
  if (Array.isArray(meta.licenses) && meta.licenses[0]?.type) return meta.licenses[0].type;
  return 'НЕ УКАЗАНА';
}

function renderDoc(direct) {
  const lines = [
    '# Сторонние зависимости (§4.3)',
    '',
    'Файл создаётся `npm run check:licenses -- --write`. Руками не править:',
    'следующий запуск перезапишет.',
    '',
    '§4.3 запрещает рекламные SDK, аналитику с идентификацией устройства,',
    'трекеры и библиотеки с неясной лицензией. Проверка обходит всё дерево',
    'зависимостей, не только прямые.',
    '',
    '| Пакет | Версия | Лицензия |',
    '| --- | --- | --- |',
  ];
  for (const dep of direct) {
    lines.push(`| \`${dep.name}\` | ${dep.version} | ${dep.license} |`);
  }

  lines.push('');
  lines.push('## Разобранные вручную исключения');
  lines.push('');
  lines.push('Транзитивные зависимости с лицензией вне разрешительного списка.');
  lines.push('');
  for (const [name, reason] of EXCEPTIONS) {
    const dep = all.find((d) => d.name === name);
    lines.push(`- \`${name}\`${dep ? `@${dep.version}` : ''} — ${dep?.license ?? '?'}: ${reason}`);
  }
  lines.push('');
  return lines.join('\n');
}

const all = collectTree();
const direct = all.filter((d) => d.direct);
const problems = [];

for (const dep of all) {
  if (!ALLOWED.has(dep.license) && !EXCEPTIONS.has(dep.name)) {
    problems.push(`неясная или неразрешённая лицензия: ${dep.name}@${dep.version} — ${dep.license}`);
  }
  if (FORBIDDEN_PATTERNS.some((re) => re.test(dep.name))) {
    problems.push(`запрещён §4.3 (реклама/трекер/аналитика): ${dep.name}@${dep.version}`);
  }
}

const doc = renderDoc(direct);

if (process.argv.includes('--write')) {
  writeFileSync(DOC, doc, 'utf8');
  console.log(`docs/THIRD_PARTY.md обновлён: ${direct.length} прямых зависимостей`);
} else {
  let current = null;
  try {
    current = readFileSync(DOC, 'utf8');
  } catch {
    problems.push('docs/THIRD_PARTY.md отсутствует — запустите с --write');
  }
  if (current !== null && current !== doc) {
    problems.push('docs/THIRD_PARTY.md разошёлся с package.json — запустите с --write');
  }
}

console.log(`Проверено пакетов: ${all.length} (прямых: ${direct.length})`);

if (problems.length > 0) {
  console.error('\nНарушения §4.3:');
  for (const problem of problems) console.error(`  ✖ ${problem}`);
  process.exit(1);
}

console.log('Нарушений §4.3 не найдено.');
