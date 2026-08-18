import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Минимальные чтение и запись PNG (8 бит, RGBA, без чересстрочности).
 *
 * Зависимостей нет намеренно: sharp тянет нативный бинарник, а §4.3 требует
 * согласовывать каждую библиотеку отдельно. Нам нужны ровно две операции —
 * уменьшить и пересобрать, — и они укладываются в полторы сотни строк.
 *
 * Используется генераторами иконок и фоновых картинок; в приложение этот код
 * не попадает.
 */

export function decodePng(buffer) {
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
 * Снятие построчных фильтров. Каждая строка расшифровывается только после
 * предыдущей — отсюда строго последовательный проход.
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

export function encodePng(width, height, pixels) {
  const stride = width * 4;
  // Фильтр 0 на всех строках: картинки маленькие, лишний процент сжатия не
  // стоит усложнения, зато код читается без справочника.
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Усреднение по прямоугольнику исходника (box filter).
 *
 * Ближайший сосед на сильном уменьшении даёт рваные края. Цвет усредняется с
 * весом альфы, иначе по краю проступает тёмная кайма от прозрачных пикселей.
 */
export function sampleBox(image, x0, y0, x1, y1) {
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

/** Пропорциональное уменьшение до заданной длинной стороны. */
export function resize(image, maxSide) {
  const factor = Math.min(1, maxSide / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * factor));
  const height = Math.max(1, Math.round(image.height * factor));
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = sampleBox(
        image,
        (x * image.width) / width,
        (y * image.height) / height,
        ((x + 1) * image.width) / width,
        ((y + 1) * image.height) / height,
      );
      const i = (y * width + x) * 4;
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = a;
    }
  }

  return { width, height, pixels };
}
