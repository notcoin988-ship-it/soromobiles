#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

import { decodePng, encodePng, resize } from './png.mjs';

/**
 * Уменьшенный кристалл для фона экрана входа.
 *
 * Исходник с продакшена — 728×839 и 724 КБ. В приложении он рисуется как
 * полупрозрачное фоновое пятно размером в пару сотен точек, то есть исходное
 * разрешение не нужно ни на одном экране: даже на планшете при трёхкратной
 * плотности хватает 320 px. А §4.3 держит бюджет APK — 724 КБ ради фона это
 * 2.4% лимита в 30 МБ, отданные ни за что.
 *
 * Запуск: npm run gen:crystal
 */

const SOURCE = 'assets/images/crystal.png';
const OUTPUT = 'assets/images/crystal-bg.png';
const MAX_SIDE = 320;

const source = decodePng(readFileSync(SOURCE));
const small = resize(source, MAX_SIDE);
const png = encodePng(small.width, small.height, small.pixels);

writeFileSync(OUTPUT, png);

const before = readFileSync(SOURCE).length;
console.log(`${SOURCE}: ${source.width}×${source.height}, ${(before / 1024).toFixed(0)} КБ`);
console.log(`${OUTPUT}: ${small.width}×${small.height}, ${(png.length / 1024).toFixed(0)} КБ`);
console.log(`Экономия: ${(100 - (png.length / before) * 100).toFixed(0)}%`);
