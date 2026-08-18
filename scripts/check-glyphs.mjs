#!/usr/bin/env node
/**
 * Проверка шрифтов на покрытие таджикской кириллицы — §7.2 п.1 и критерий
 * приёмки §17 («0 квадратов вместо таджикских букв»).
 *
 * ТЗ предлагает делать это руками через fc-query, ttx или онлайн-инспектор.
 * Здесь это команда, которую можно поставить в CI: она читает таблицу cmap
 * прямо из .ttf/.otf и говорит, каких глифов не хватает.
 *
 * Зачем вообще. В вебе цепочка `Bricolage Grotesque, Rubik, sans-serif`
 * подставляет недостающий глиф поглифно, поэтому дефект не виден. В React
 * Native фолбэка нет: нет глифа — на экране □. Проверено по метаданным
 * Google Fonts:
 *   • Bricolage Grotesque — кириллицы нет вообще;
 *   • Rubik — нет Ҳ/ҳ (U+04B2/U+04B3), в cyrillic-ext пропущены 1202–1205;
 *   • Inter, Noto Sans, IBM Plex Sans — покрывают все шесть пар.
 *
 * Запуск:
 *   node scripts/check-glyphs.mjs assets/fonts
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

/** Шесть таджикских пар из §17 — ровно те, что перечислены в критерии. */
const REQUIRED = [
  [0x0492, 'Ғ'],
  [0x0493, 'ғ'],
  [0x049a, 'Қ'],
  [0x049b, 'қ'],
  [0x04b2, 'Ҳ'],
  [0x04b3, 'ҳ'],
  [0x04b6, 'Ҷ'],
  [0x04b7, 'ҷ'],
  [0x04e2, 'Ӣ'],
  [0x04e3, 'ӣ'],
  [0x04ee, 'Ӯ'],
  [0x04ef, 'ӯ'],
];

/**
 * Разбирает таблицу cmap и возвращает множество покрытых кодпоинтов.
 * Поддержаны форматы 4 (BMP) и 12 (полный диапазон) — этого достаточно для
 * любого современного TTF/OTF.
 */
function coveredCodepoints(buffer) {
  const covered = new Set();

  // Заголовок шрифта: количество таблиц и их каталог.
  const tableCount = buffer.readUInt16BE(4);
  let cmapOffset = null;
  for (let i = 0; i < tableCount; i += 1) {
    const record = 12 + i * 16;
    if (buffer.toString('ascii', record, record + 4) === 'cmap') {
      cmapOffset = buffer.readUInt32BE(record + 8);
    }
  }
  if (cmapOffset === null) return covered;

  const subtableCount = buffer.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < subtableCount; i += 1) {
    const record = cmapOffset + 4 + i * 8;
    const offset = cmapOffset + buffer.readUInt32BE(record + 4);
    const format = buffer.readUInt16BE(offset);

    if (format === 4) {
      const segCountX2 = buffer.readUInt16BE(offset + 6);
      const endOffset = offset + 14;
      const startOffset = endOffset + segCountX2 + 2;
      for (let s = 0; s < segCountX2 / 2; s += 1) {
        const end = buffer.readUInt16BE(endOffset + s * 2);
        const start = buffer.readUInt16BE(startOffset + s * 2);
        if (start === 0xffff) continue;
        for (let c = start; c <= end && c < 0xffff; c += 1) covered.add(c);
      }
    } else if (format === 12) {
      const groups = buffer.readUInt32BE(offset + 12);
      for (let g = 0; g < groups; g += 1) {
        const groupOffset = offset + 16 + g * 12;
        const start = buffer.readUInt32BE(groupOffset);
        const end = buffer.readUInt32BE(groupOffset + 4);
        for (let c = start; c <= end; c += 1) covered.add(c);
      }
    }
  }

  return covered;
}

function main() {
  const dir = process.argv[2] ?? 'assets/fonts';

  if (!existsSync(dir)) {
    console.error(`Папка со шрифтами не найдена: ${dir}`);
    process.exit(2);
  }

  const fonts = readdirSync(dir)
    .filter((f) => ['.ttf', '.otf'].includes(extname(f).toLowerCase()))
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile());

  if (fonts.length === 0) {
    console.error(`В ${dir} нет ни одного .ttf/.otf.`);
    console.error('Шрифты обязаны лежать в бандле, а не подгружаться с Google Fonts (§7.2).');
    process.exit(2);
  }

  let failed = 0;

  for (const font of fonts) {
    const covered = coveredCodepoints(readFileSync(font));
    const missing = REQUIRED.filter(([cp]) => !covered.has(cp));

    const name = basename(font);
    if (missing.length === 0) {
      console.log(`  ✅ ${name} — все 12 таджикских глифов на месте (${covered.size} в cmap)`);
    } else {
      failed += 1;
      const list = missing.map(([cp, ch]) => `${ch} U+${cp.toString(16).toUpperCase()}`).join(', ');
      console.error(`  ❌ ${name} — НЕ ХВАТАЕТ: ${list}`);
    }
  }

  console.log();
  if (failed === 0) {
    console.log(`Проверено файлов: ${fonts.length}. Критерий §17 по глифам выполнен.`);
    process.exit(0);
  }

  console.error(
    `Шрифтов с пропусками: ${failed} из ${fonts.length}. На экране они дадут □ вместо букв.`,
  );
  process.exit(1);
}

main();
