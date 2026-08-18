#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Иконки приложения из логотипа zehn (§14, §15).
 *
 * Сделано скриптом, а не руками в редакторе, по трём причинам:
 *   1. магазины требуют набор размеров с разными правилами (иконка iOS не
 *      может быть прозрачной, у адаптивной иконки Android есть безопасная
 *      зона) — руками это повторить одинаково сложно;
 *   2. поменяется логотип — иконки пересобираются одной командой;
 *   3. видно, ЧТО именно сделано с исходником: обрезка, поля, фон.
 *
 * Зависимостей нет намеренно: sharp тянет нативный бинарник, а §4.3 требует
 * согласовывать каждую библиотеку. PNG тут читается и пишется вручную —
 * благо RGBA без чересстрочности это полсотни строк.
 */

const SOURCE = 'assets/images/soro-logo.png';

/** Фон тёмной темы (bg0). Иконка iOS обязана быть непрозрачной. */
const BG = [0x0b, 0x09, 0x0a, 0xff];

const TARGETS = [
  {
    // Магазины и iOS: непрозрачный квадрат, логотип занимает 62%.
    file: 'assets/icon.png',
    size: 1024,
    scale: 0.62,
    background: BG,
  },
  {
    /**
     * Адаптивная иконка Android. Система обрезает её маской произвольной
     * формы и оставляет гарантированно видимой только центральную окружность
     * диаметром 66% — поэтому логотип занимает меньше половины холста.
     * Фон задаётся отдельно в app.config.ts, здесь он прозрачный.
     */
    file: 'assets/android-icon-foreground.png',
    size: 1024,
    scale: 0.44,
    background: null,
  },
  {
    // Монохромная иконка для темы Material You: силуэт белым по прозрачному.
    file: 'assets/android-icon-monochrome.png',
    size: 1024,
    scale: 0.44,
    background: null,
    monochrome: [0xff, 0xff, 0xff],
  },
  {
    // Фон под адаптивной иконкой — сплошной bg0.
    file: 'assets/android-icon-background.png',
    size: 1024,
    scale: 0,
    background: BG,
  },
  {
    // Экран запуска: логотип мелкий, вокруг воздух.
    file: 'assets/splash-icon.png',
    size: 512,
    scale: 0.5,
    background: null,
  },
  { file: 'assets/favicon.png', size: 64, scale: 0.86, background: null },
];

// ---------------------------------------------------------------------------
// Чтение PNG
// ---------------------------------------------------------------------------

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('не PNG');

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('чересстрочный PNG не поддерживается');
    }
    if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`нужен 8-битный RGBA, получено bitDepth=${bitDepth} colorType=${colorType}`);
  }

  return { width, height, pixels: unfilter(inflateSync(Buffer.concat(idat)), width, height) };
}

/**
 * Снятие построчных фильтров PNG. Каждая строка начинается с байта типа
 * фильтра, и распаковать её можно только после предыдущей — отсюда
 * последовательный проход.
 */
function unfilter(raw, width, height) {
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;

    for (let x = 0; x < stride; x += 1) {
      const value = raw[pos + x];
      const left = x >= bpp ? out[y * stride + x - bpp] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;

      let restored;
      switch (filter) {
        case 0:
          restored = value;
          break;
        case 1:
          restored = value + left;
          break;
        case 2:
          restored = value + up;
          break;
        case 3:
          restored = value + ((left + up) >> 1);
          break;
        case 4: {
          const predicted = left + up - upLeft;
          const dl = Math.abs(predicted - left);
          const du = Math.abs(predicted - up);
          const dul = Math.abs(predicted - upLeft);
          restored = value + (dl <= du && dl <= dul ? left : du <= dul ? up : upLeft);
          break;
        }
        default:
          throw new Error(`неизвестный фильтр PNG: ${filter}`);
      }
      out[y * stride + x] = restored & 0xff;
    }
    pos += stride;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Запись PNG
// ---------------------------------------------------------------------------

function crc32(bytes) {
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  // Фильтр 0 для всех строк: картинки маленькие, лишний процент сжатия не
  // стоит усложнения, а читать такой код можно без справочника.
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bitDepth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Обработка
// ---------------------------------------------------------------------------

/** Границы непрозрачной части: поля исходника не должны съедать иконку. */
function opaqueBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.pixels[(y * image.width + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) throw new Error('исходник полностью прозрачный');
  return { minX, minY, maxX, maxY };
}

/**
 * Усреднение по прямоугольнику исходника (box filter).
 *
 * Ближайший сосед на уменьшении 601 → 64 даёт рваные края, а логотип состоит
 * из диагоналей — там это особенно заметно. Цвет усредняется с весом альфы,
 * иначе по краю проступает тёмная кайма от прозрачных пикселей.
 */
function sampleBox(image, x0, y0, x1, y1) {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let n = 0;

  const xs = Math.max(0, Math.floor(x0));
  const ys = Math.max(0, Math.floor(y0));
  const xe = Math.min(image.width, Math.max(xs + 1, Math.ceil(x1)));
  const ye = Math.min(image.height, Math.max(ys + 1, Math.ceil(y1)));

  for (let y = ys; y < ye; y += 1) {
    for (let x = xs; x < xe; x += 1) {
      const i = (y * image.width + x) * 4;
      const alpha = image.pixels[i + 3];
      r += image.pixels[i] * alpha;
      g += image.pixels[i + 1] * alpha;
      b += image.pixels[i + 2] * alpha;
      a += alpha;
      n += 1;
    }
  }

  if (a === 0) return [0, 0, 0, 0];
  return [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round(a / n)];
}

function render(image, bounds, target) {
  const { size, scale, background, monochrome } = target;
  const canvas = Buffer.alloc(size * size * 4);

  if (background) {
    for (let i = 0; i < size * size; i += 1) {
      canvas[i * 4] = background[0];
      canvas[i * 4 + 1] = background[1];
      canvas[i * 4 + 2] = background[2];
      canvas[i * 4 + 3] = background[3];
    }
  }

  if (scale <= 0) return canvas;

  const srcW = bounds.maxX - bounds.minX + 1;
  const srcH = bounds.maxY - bounds.minY + 1;
  // Вписываем по длинной стороне и сохраняем пропорции: логотип не квадратный.
  const box = size * scale;
  const factor = Math.min(box / srcW, box / srcH);
  const dstW = Math.round(srcW * factor);
  const dstH = Math.round(srcH * factor);
  const offsetX = Math.round((size - dstW) / 2);
  const offsetY = Math.round((size - dstH) / 2);

  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const [r, g, b, a] = sampleBox(
        image,
        bounds.minX + (x * srcW) / dstW,
        bounds.minY + (y * srcH) / dstH,
        bounds.minX + ((x + 1) * srcW) / dstW,
        bounds.minY + ((y + 1) * srcH) / dstH,
      );
      if (a === 0) continue;

      const i = ((y + offsetY) * size + (x + offsetX)) * 4;
      const [sr, sg, sb] = monochrome ?? [r, g, b];

      if (background) {
        // Смешивание с фоном: прозрачности в итоговой иконке быть не должно.
        const alpha = a / 255;
        canvas[i] = Math.round(sr * alpha + background[0] * (1 - alpha));
        canvas[i + 1] = Math.round(sg * alpha + background[1] * (1 - alpha));
        canvas[i + 2] = Math.round(sb * alpha + background[2] * (1 - alpha));
        canvas[i + 3] = 255;
      } else {
        canvas[i] = sr;
        canvas[i + 1] = sg;
        canvas[i + 2] = sb;
        canvas[i + 3] = a;
      }
    }
  }

  return canvas;
}

const source = decodePng(readFileSync(SOURCE));
const bounds = opaqueBounds(source);

console.log(`Исходник ${SOURCE}: ${source.width}×${source.height}`);
console.log(
  `Непрозрачная область: ${bounds.maxX - bounds.minX + 1}×${bounds.maxY - bounds.minY + 1} ` +
    `от (${bounds.minX}, ${bounds.minY})`,
);

for (const target of TARGETS) {
  const pixels = render(source, bounds, target);
  const png = encodePng(target.size, target.size, pixels);
  writeFileSync(target.file, png);
  console.log(`  ${target.file} — ${target.size}×${target.size}, ${png.length} байт`);
}

console.log('Готово.');
