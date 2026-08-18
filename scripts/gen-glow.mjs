#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

import { encodePng } from './png.mjs';

/**
 * Статичный слой свечения для слабых устройств (§12).
 *
 * ТЗ: «Фоновые градиенты glow-field на устройствах с < 3 ГБ ОЗУ заменяются
 * статичным PNG». Раньше слой на таких аппаратах просто не рисовался, и фон
 * оставался плоским чёрным — а это ровно Redmi 9A из матрицы §12 и, как
 * выяснилось, штатный эмулятор с 2.4 ГБ. Здесь та же картинка печётся заранее.
 *
 * Картинка с АЛЬФОЙ, без фона: один файл ложится и на тёмную тему, и на
 * светлую. Разрешение намеренно маленькое — свечение мягкое, растянуть его
 * `resizeMode="cover"` можно на любой экран без видимой разницы, зато вес
 * файла остаётся в десятках килобайт.
 *
 * Значения слоёв — те же, что в design/tokens.ts (glowField), снятые с
 * `.glow-field:before` продакшена. При правке токенов перегенерировать:
 *
 *   node scripts/gen-glow.mjs
 */

const WIDTH = 270;
const HEIGHT = 585; // 1080×2340 в четверть — пропорции целевого экрана
const OUTPUT = 'assets/images/glow-bg.png';

/**
 * Слои `.glow-field:before`. Порядок как в CSS: первый рисуется поверх.
 * cx/cy/rx/ry — доли, stop — где градиент окончательно растворяется.
 */
const LAYERS = [
  { rgb: [255, 46, 99], alpha: 0.22, cx: 0.72, cy: 0.18, rx: 0.4, ry: 0.5, stop: 0.7 },
  { rgb: [190, 10, 51], alpha: 0.2, cx: 0.22, cy: 0.88, rx: 0.46, ry: 0.56, stop: 0.72 },
  { rgb: [229, 16, 63], alpha: 0.1, cx: 0.5, cy: 1.2, rx: 0.6, ry: 0.7, stop: 0.7 },
];

/**
 * Радиусы считаются от ШИРИНЫ по обеим осям — как и в живом слое
 * (design/GlowField.tsx). Проценты из CSS сняты с широкого монитора; если
 * взять ry от высоты телефона, пятно вытянется в полосу, а его центр уедет
 * за нижний край экрана.
 */
const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);

for (let y = 0; y < HEIGHT; y++) {
  for (let x = 0; x < WIDTH; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    for (const layer of LAYERS) {
      const dx = (x / WIDTH - layer.cx) / layer.rx;
      const dy = (y / HEIGHT - layer.cy) / (layer.ry * (WIDTH / HEIGHT));
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Линейное затухание до полной прозрачности на stop — как у CSS-градиента.
      const strength = Math.max(0, 1 - distance / layer.stop) * layer.alpha;
      if (strength <= 0) continue;

      // Композиция «source-over»: слои накладываются друг на друга.
      const out = strength + a * (1 - strength);
      r = (layer.rgb[0] * strength + r * a * (1 - strength)) / out;
      g = (layer.rgb[1] * strength + g * a * (1 - strength)) / out;
      b = (layer.rgb[2] * strength + b * a * (1 - strength)) / out;
      a = out;
    }

    const i = (y * WIDTH + x) * 4;
    pixels[i] = Math.round(r);
    pixels[i + 1] = Math.round(g);
    pixels[i + 2] = Math.round(b);
    pixels[i + 3] = Math.round(a * 255);
  }
}

const png = encodePng(WIDTH, HEIGHT, pixels);
writeFileSync(OUTPUT, png);
console.log(`${OUTPUT} — ${WIDTH}×${HEIGHT}, ${Math.round(png.length / 1024)} КБ`);
