#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

import { encodePng } from './png.mjs';

/**
 * Сетка граней (.facets) — второй фоновый слой поверх свечения (§7.1:
 * «непрозрачность слоя на экране приветствия — 0.28 для сетки граней»).
 *
 * На проде это два CSS-градиента с диагональными полосами:
 *
 *   linear-gradient(135deg, transparent 0 49.6%, rgba(255,255,255,.04) 49.6% 50.2%, transparent 50.2%)
 *   linear-gradient(45deg,  transparent 0 49.6%, rgba(255,255,255,.03) 49.6% 50.2%, transparent 50.2%)
 *   background-size: 90px 90px, 64px 64px
 *
 * В React Native повторяющихся CSS-градиентов нет, поэтому каждая плитка
 * печётся в PNG и размножается через resizeMode="repeat". Диагональ через
 * квадратную плитку стыкуется сама с собой без шва — именно так это и
 * работает в CSS.
 *
 * ПОЧЕМУ НЕ SVG PATTERN. Узор статичный и мельче некуда: два спрайта по
 * полкилобайта дешевле, чем векторный слой, который пересчитывается на каждом
 * изменении размера. §12 и так просит беречь кадр на слабых устройствах.
 *
 * mix-blend-mode: screen из CSS не воспроизводится (в RN его нет), но поверх
 * тёмного фона screen для белого с альфой 3–4% совпадает с обычным наложением
 * с точностью до единиц из 255.
 *
 *   node scripts/gen-facets.mjs
 */

/** Полоса занимает 49.6–50.2% длины градиентной оси — как в CSS. */
const BAND_FROM = 0.496;
const BAND_TO = 0.502;

const TILES = [
  { file: 'assets/images/facets-135.png', size: 90, angle: 135, alpha: 0.04 },
  { file: 'assets/images/facets-45.png', size: 64, angle: 45, alpha: 0.03 },
];

/**
 * Позиция точки на оси CSS-градиента, 0..1.
 *
 * Угол в CSS отсчитывается от направления «вверх» по часовой стрелке, ось
 * направлена к концу градиента, а длина оси для наклонного направления равна
 * |W·sin| + |H·cos| — иначе полоса окажется не на своём месте.
 */
function axisPosition(x, y, size, angle) {
  const radians = (angle * Math.PI) / 180;
  const dirX = Math.sin(radians);
  const dirY = -Math.cos(radians);
  const length = Math.abs(size * dirX) + Math.abs(size * dirY);

  const centered = (x + 0.5 - size / 2) * dirX + (y + 0.5 - size / 2) * dirY;
  return centered / length + 0.5;
}

for (const tile of TILES) {
  const pixels = Buffer.alloc(tile.size * tile.size * 4);

  for (let y = 0; y < tile.size; y++) {
    for (let x = 0; x < tile.size; x++) {
      const t = axisPosition(x, y, tile.size, tile.angle);

      /**
       * Сглаживание по краю полосы: без него диагональ на экране получается
       * рваной лесенкой — плитка мелкая, и один пиксель здесь заметен.
       * Полупиксельный переход по обе стороны границы даёт ровную линию.
       */
      const half = 0.5 / tile.size;
      const edgeIn = Math.min(1, Math.max(0, (t - (BAND_FROM - half)) / (2 * half)));
      const edgeOut = Math.min(1, Math.max(0, ((BAND_TO + half) - t) / (2 * half)));
      const coverage = Math.min(edgeIn, edgeOut);

      const i = (y * tile.size + x) * 4;
      pixels[i] = 255;
      pixels[i + 1] = 255;
      pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(tile.alpha * coverage * 255);
    }
  }

  const png = encodePng(tile.size, tile.size, pixels);
  writeFileSync(tile.file, png);
  console.log(`${tile.file} — ${tile.size}×${tile.size}, ${png.length} байт`);
}
