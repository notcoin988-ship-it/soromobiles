/**
 * Набор иконок (§4.2: «Собственный SVG-набор, портируется из
 * soro_front/src/components/icons.jsx. Никаких сторонних icon-пакетов»).
 *
 * ФАЙЛ СГЕНЕРИРОВАН: scripts/extract-icons.mjs. Руками не править.
 *
 * Репозиторий веба не предоставлен, поэтому набор снят с продакшена —
 * объект Icons сохранился в бандле sorollm.tj целиком, вместе с именами и
 * толщинами обводки. Значения по умолчанию взяты у тамошнего компонента Ic:
 * размер 20, strokeWidth 1.8, fill none, стык и конец линии — round.
 */

export const ICON_VIEW_BOX = '0 0 24 24';
export const ICON_STROKE_WIDTH = 1.8;

export type IconShape =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: string; cy: string; r: string }
  | { kind: 'rect'; x: string; y: string; width: string; height: string; rx: string | null }
  | { kind: 'line'; x1: string; y1: string; x2: string; y2: string };

export type IconDefinition = {
  shapes: readonly IconShape[];
  /** Своя толщина обводки там, где она отличается от базовой. */
  strokeWidth?: number;
  /** Залитые иконки (fill вместо stroke) — обводка тогда не рисуется. */
  fill?: string;
};

export const ICONS = {
  arrowUp: {
    shapes: [
      { kind: 'path', d: "M12 19V5 M6 11l6-6 6 6" },
    ],
    strokeWidth: 2.2,
  },
  attach: {
    shapes: [
      { kind: 'path', d: "M21.4 11.05 12.2 20.3a5 5 0 0 1-7.1-7.1l9.2-9.2a3.33 3.33 0 0 1 4.7 4.7l-9.2 9.2a1.67 1.67 0 0 1-2.35-2.35l8.5-8.5" },
    ],
  },
  bolt: {
    shapes: [
      { kind: 'path', d: "M13 2 4 14h7l-1 8 9-12h-7l1-8z" },
    ],
  },
  book: {
    shapes: [
      { kind: 'path', d: "M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2V5z M18 3v18 M8 7h6 M8 11h6" },
    ],
  },
  brain: {
    shapes: [
      { kind: 'path', d: "M9.5 4.5A2.5 2.5 0 0 0 7 7v.2A2.8 2.8 0 0 0 5 10a2.8 2.8 0 0 0 .6 1.8A2.8 2.8 0 0 0 5 14a2.8 2.8 0 0 0 2.5 2.8A2.5 2.5 0 0 0 12 18.5V4.5a2 2 0 0 0-2.5 0z M14.5 4.5A2.5 2.5 0 0 1 17 7v.2A2.8 2.8 0 0 1 19 10a2.8 2.8 0 0 1-.6 1.8A2.8 2.8 0 0 1 19 14a2.8 2.8 0 0 1-2.5 2.8A2.5 2.5 0 0 1 12 18.5" },
    ],
  },
  camera: {
    shapes: [
      { kind: 'path', d: "M3 8a2 2 0 0 1 2-2h2l1.5-2h7L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" },
      { kind: 'circle', cx: '12', cy: '12.5', r: '3.2' },
    ],
  },
  check: {
    shapes: [
      { kind: 'path', d: "M5 12l5 5L20 6" },
    ],
    strokeWidth: 2.2,
  },
  chevDown: {
    shapes: [
      { kind: 'path', d: "M6 9l6 6 6-6" },
    ],
    strokeWidth: 2,
  },
  chevLeft: {
    shapes: [
      { kind: 'path', d: "M15 6l-6 6 6 6" },
    ],
    strokeWidth: 2,
  },
  chevRight: {
    shapes: [
      { kind: 'path', d: "M9 6l6 6-6 6" },
    ],
    strokeWidth: 2,
  },
  clock: {
    shapes: [
      { kind: 'circle', cx: '12', cy: '12', r: '9' },
      { kind: 'path', d: "M12 7v5l3.5 2" },
    ],
  },
  close: {
    shapes: [
      { kind: 'path', d: "M18 6 6 18 M6 6l12 12" },
    ],
    strokeWidth: 2,
  },
  compass: {
    shapes: [
      { kind: 'circle', cx: '12', cy: '12', r: '9' },
      { kind: 'path', d: "M15.5 8.5l-2 5-5 2 2-5 5-2z" },
    ],
  },
  copy: {
    shapes: [
      { kind: 'rect', x: '9', y: '9', width: '11', height: '11', rx: '2' },
      { kind: 'path', d: "M5 15V5a2 2 0 0 1 2-2h8" },
    ],
  },
  dots: {
    shapes: [
      { kind: 'circle', cx: '5', cy: '12', r: '1.6' },
      { kind: 'circle', cx: '12', cy: '12', r: '1.6' },
      { kind: 'circle', cx: '19', cy: '12', r: '1.6' },
    ],
    fill: 'currentColor',
  },
  edit: {
    shapes: [
      { kind: 'path', d: "M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" },
    ],
  },
  filePdf: {
    shapes: [
      { kind: 'path', d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z M14 3v5h5" },
    ],
  },
  fileText: {
    shapes: [
      { kind: 'path', d: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z M14 3v5h5 M9 13h6 M9 17h6" },
    ],
  },
  folder: {
    shapes: [
      { kind: 'path', d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" },
    ],
  },
  globe: {
    shapes: [
      { kind: 'circle', cx: '12', cy: '12', r: '9' },
      { kind: 'path', d: "M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18" },
    ],
  },
  image: {
    shapes: [
      { kind: 'rect', x: '3', y: '4', width: '18', height: '16', rx: '2' },
      { kind: 'circle', cx: '8.5', cy: '9.5', r: '1.5' },
      { kind: 'path', d: "M21 16l-4.5-4.5L5 21" },
    ],
  },
  link: {
    shapes: [
      { kind: 'path', d: "M9 15l6-6 M11 6l1-1a4 4 0 0 1 6 6l-1 1 M13 18l-1 1a4 4 0 0 1-6-6l1-1" },
    ],
  },
  logout: {
    shapes: [
      { kind: 'path', d: "M15 17l5-5-5-5 M20 12H9 M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" },
    ],
  },
  message: {
    shapes: [
      { kind: 'path', d: "M21 11.5a8.4 8.4 0 0 1-9 8.4 9.5 9.5 0 0 1-4-1L3 20l1.1-3.3A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" },
    ],
  },
  mic: {
    shapes: [
      { kind: 'rect', x: '9', y: '3', width: '6', height: '11', rx: '3' },
      { kind: 'path', d: "M5 11a7 7 0 0 0 14 0 M12 18v3" },
    ],
  },
  moon: {
    shapes: [
      { kind: 'path', d: "M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" },
    ],
  },
  mountain: {
    shapes: [
      { kind: 'path', d: "M3 20h18 L14 7l-3.2 5.3L8.5 9 3 20z M14 7l3 4.5" },
    ],
  },
  pencil: {
    shapes: [
      { kind: 'path', d: "M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" },
    ],
  },
  pin: {
    shapes: [
      { kind: 'path', d: "M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6z M12 15v5" },
    ],
  },
  plus: {
    shapes: [
      { kind: 'path', d: "M12 5v14 M5 12h14" },
    ],
    strokeWidth: 2,
  },
  refresh: {
    shapes: [
      { kind: 'path', d: "M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5" },
    ],
  },
  scroll: {
    shapes: [
      { kind: 'path', d: "M8 3h9a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2h3 M12 8h4 M12 12h4" },
    ],
  },
  search: {
    shapes: [
      { kind: 'circle', cx: '11', cy: '11', r: '7' },
      { kind: 'path', d: "M21 21l-4.3-4.3" },
    ],
  },
  send: {
    shapes: [
      { kind: 'path', d: "M5 12h14 M13 6l6 6-6 6" },
    ],
    strokeWidth: 2.2,
  },
  /** Не из бандла: построена геометрией: дуги из бандла разъезжаются на 20 px (см. SHAPE_OVERRIDES). */
  settings: {
    shapes: [
      { kind: 'circle', cx: '12', cy: '12', r: '3' },
      { kind: 'path', d: "M10.09 3A9.2 9.2 0 0 1 13.91 3L13.36 5.85A6.3 6.3 0 0 1 15.38 6.69L17.01 4.28A9.2 9.2 0 0 1 19.72 6.99L17.31 8.62A6.3 6.3 0 0 1 18.15 10.64L21 10.09A9.2 9.2 0 0 1 21 13.91L18.15 13.36A6.3 6.3 0 0 1 17.31 15.38L19.72 17.01A9.2 9.2 0 0 1 17.01 19.72L15.38 17.31A6.3 6.3 0 0 1 13.36 18.15L13.91 21A9.2 9.2 0 0 1 10.09 21L10.64 18.15A6.3 6.3 0 0 1 8.62 17.31L6.99 19.72A9.2 9.2 0 0 1 4.28 17.01L6.69 15.38A6.3 6.3 0 0 1 5.85 13.36L3 13.91A9.2 9.2 0 0 1 3 10.09L5.85 10.64A6.3 6.3 0 0 1 6.69 8.62L4.28 6.99A9.2 9.2 0 0 1 6.99 4.28L8.62 6.69A6.3 6.3 0 0 1 10.64 5.85Z" },
    ],
  },
  share: {
    shapes: [
      { kind: 'circle', cx: '18', cy: '5', r: '3' },
      { kind: 'circle', cx: '6', cy: '12', r: '3' },
      { kind: 'circle', cx: '18', cy: '19', r: '3' },
      { kind: 'path', d: "M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4" },
    ],
  },
  sidebar: {
    shapes: [
      { kind: 'rect', x: '3', y: '4', width: '18', height: '16', rx: '2' },
      { kind: 'path', d: "M9 4v16" },
    ],
  },
  spark2: {
    shapes: [
      { kind: 'path', d: "M5 3v4 M3 5h4 M6 17v4 M4 19h4 M14 4l2.5 6.5L23 13l-6.5 2.5L14 22l-2.5-6.5L5 13l6.5-2.5L14 4z" },
    ],
  },
  sparkle: {
    shapes: [
      { kind: 'path', d: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" },
    ],
  },
  stop: {
    shapes: [
      { kind: 'rect', x: '6', y: '6', width: '12', height: '12', rx: '2.5' },
    ],
    fill: 'currentColor',
  },
  sun: {
    shapes: [
      { kind: 'circle', cx: '12', cy: '12', r: '4' },
      { kind: 'path', d: "M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4" },
    ],
  },
  thumbDown: {
    shapes: [
      { kind: 'path', d: "M17 14V3 M17 14l-4 7a2 2 0 0 1-2.7-.9 2.7 2.7 0 0 1-.3-1.2V16H5.5a2 2 0 0 1-2-2.3l1.3-7a2 2 0 0 1 2-1.7H17" },
    ],
  },
  thumbUp: {
    shapes: [
      { kind: 'path', d: "M7 10v11 M7 10l4-7a2 2 0 0 1 2.7.9c.2.4.3.8.3 1.2V8h4.5a2 2 0 0 1 2 2.3l-1.3 7a2 2 0 0 1-2 1.7H7" },
    ],
  },
  translate: {
    shapes: [
      { kind: 'path', d: "M4 5h7 M9 3v2c0 4-2.5 7-6 8 M5 9c0 2.5 3 4.5 5 5 M13 21l4-9 4 9 M14.5 17h5" },
    ],
  },
  trash: {
    shapes: [
      { kind: 'path', d: "M4 7h16 M10 11v6 M14 11v6 M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13 M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" },
    ],
  },
  volume: {
    shapes: [
      { kind: 'path', d: "M11 5 6 9H3v6h3l5 4V5z M16 9a3 3 0 0 1 0 6 M19 7a7 7 0 0 1 0 10" },
    ],
  },
  waveform: {
    shapes: [
      { kind: 'path', d: "M4 10v4 M8 6v12 M12 8v8 M16 5v14 M20 10v4" },
    ],
  },
} as const satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICONS;
