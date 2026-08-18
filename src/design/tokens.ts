import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Дизайн-токены Soro.
 *
 * Значения перенесены один-в-один из Приложения B ТЗ и СВЕРЕНЫ с продом —
 * скомпилированным CSS https://sorollm.tj/assets/index-*.css. Совпали дословно:
 * вся палитра ruby, bg0…bg4, surfaceGlass, border/borderStrong, text/text2/text3,
 * rubySoft/rubySoft2, три тени в обеих темах, userBubble, glow-field, ruby-text,
 * pill-ruby, shimmer-text.
 *
 * Это ЕДИНСТВЕННОЕ место в проекте, где допускаются hex-литералы (§5.2).
 * Правило enforced линтером: no-restricted-syntax на /^#[0-9a-fA-F]{3,8}$/
 * с исключением src/design/**.
 */

// ---------------------------------------------------------------------------
// Акцентная рампа — одинакова в обеих темах (§7.1).
// В реальном CSS веба --ruby-* не переопределяются для светлой темы, поэтому
// «акцент в тёмной чуть светлее» из брифа §4.2 не реализуем: копируем факт.
// ---------------------------------------------------------------------------

export const ruby = {
  r300: '#FF7DA0',
  r400: '#FF4D78',
  r500: '#F0285A',
  r600: '#E5103F',
  r700: '#BE0A33',
  r800: '#8E0726',
  glow: '#FF2E63',
} as const;

// ---------------------------------------------------------------------------
// Тени. В CSS это `0 24px 60px -12px rgba(...)`, где -12px — spread,
// которого в React Native нет вообще. Приближаем: iOS shadowRadius ≈ blur/2,
// Android — elevation. Значения elevation взяты из Приложения B (§7.1).
// ---------------------------------------------------------------------------

export type ShadowToken = {
  readonly color: string;
  readonly opacity: number;
  /** CSS blur-radius в px. iOS shadowRadius = radius / 2. */
  readonly radius: number;
  readonly offsetY: number;
  readonly elevation: number;
};

const dark = {
  bg0: '#0B090A',
  bg1: '#110E0F',
  bg2: '#171314',
  bg3: '#1F1819',
  bg4: '#281F21',
  surfaceGlass: 'rgba(28,22,24,0.72)',
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.12)',
  text: '#F2ECEE',
  text2: '#B3A9AC',
  text3: '#7A6F72',
  textOnRuby: '#FFFFFF',
  rubySoft: 'rgba(229,16,63,0.14)',
  rubySoft2: 'rgba(229,16,63,0.08)',
  /** Затемнение под модальным листом. В вебе модалок нет — значение наше. */
  scrim: 'rgba(0,0,0,0.60)',
  shadowLg: { color: '#000000', opacity: 0.7, radius: 60, offsetY: 24, elevation: 12 },
  shadowMd: { color: '#000000', opacity: 0.6, radius: 24, offsetY: 8, elevation: 6 },
  shadowGlow: { color: '#E5103F', opacity: 0.45, radius: 40, offsetY: 8, elevation: 8 },
} as const;

const light = {
  bg0: '#FBF7F8',
  bg1: '#FFFFFF',
  bg2: '#FFFFFF',
  bg3: '#F4EEF0',
  bg4: '#EFE6E9',
  surfaceGlass: 'rgba(255,255,255,0.82)',
  border: 'rgba(20,8,12,0.09)',
  borderStrong: 'rgba(20,8,12,0.16)',
  text: '#1A1113',
  text2: '#6A5C60',
  text3: '#9A8C90',
  textOnRuby: '#FFFFFF',
  rubySoft: 'rgba(229,16,63,0.10)',
  rubySoft2: 'rgba(229,16,63,0.05)',
  scrim: 'rgba(20,8,12,0.42)',
  shadowLg: { color: '#78142D', opacity: 0.18, radius: 60, offsetY: 24, elevation: 12 },
  shadowMd: { color: '#78142D', opacity: 0.14, radius: 24, offsetY: 8, elevation: 6 },
  shadowGlow: { color: '#E5103F', opacity: 0.3, radius: 40, offsetY: 8, elevation: 8 },
} as const;

/** dark — тема по умолчанию (§7: в вебе это :root, светлая — [data-theme="light"]). */
export const themes = { dark, light } as const;

export type ThemeName = keyof typeof themes;

/**
 * Объединение, а НЕ `typeof dark`: из-за `as const` у dark литеральные типы
 * ('#0B090A'), и светлая тема в такой тип не присваивается. Чтение
 * `theme.bg0` даёт '#0B090A' | '#FBF7F8' — для style-пропов это обычная строка.
 */
export type Theme = (typeof themes)[ThemeName];

// ---------------------------------------------------------------------------
// Градиенты. Координаты start/end в терминах expo-linear-gradient.
// 135deg в CSS = по диагонали сверху-слева вниз-справа → {0,0} → {1,1}.
// ---------------------------------------------------------------------------

export const gradients = {
  /** Пузырь пользователя, кнопка отправки, основные действия. */
  userBubble: { colors: [ruby.r600, ruby.r700], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  /** Кнопка «Чати нав». */
  pillRuby: { colors: [ruby.r500, ruby.r700], start: { x: 0, y: 0 }, end: { x: 1, y: 1 } },
  /** Активная строка списка чатов (горизонтальный). */
  rowActive: {
    colors: ['rgba(229,16,63,0.14)', 'rgba(229,16,63,0.05)'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },
  /** Плашка исчерпанного лимита (вертикальный, §8.6). */
  limitNotice: {
    colors: ['rgba(229,16,63,0.10)', 'rgba(229,16,63,0.04)'],
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
  },
} as const;

/**
 * Текстовый градиент логотипа (.ruby-text).
 * CSS: linear-gradient(100deg, #FF4D78, #FF2E63 40%, #FF7DA0 70%, #F0285A)
 */
export const rubyTextGradient = {
  colors: [ruby.r400, ruby.glow, ruby.r300, ruby.r500],
  locations: [0, 0.4, 0.7, 1],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 0 },
} as const;

/**
 * Мерцающий текст «Фикр дорам…» (.shimmer-text, §7.5).
 * Стопов градиента в ТЗ нет — сняты с прода:
 *   linear-gradient(90deg, --text-3 20%, --text 45%, --ruby-400 55%, --text-3 80%)
 *   background-size: 200% 100%; animation: shimmer 2.2s linear infinite
 * Цвета зависят от темы, поэтому здесь только раскладка и тайминг.
 */
export const shimmer = {
  locations: [0.2, 0.45, 0.55, 0.8],
  /** Полотно вдвое шире контейнера — его и гоняем по X. */
  widthMultiplier: 2,
  durationMs: 2200,
  colorsFor: (theme: Theme) => [theme.text3, theme.text, ruby.r400, theme.text3] as const,
} as const;

/**
 * Фоновое свечение экрана приветствия (.glow-field) — три радиальных слоя
 * поверх bg0. Размытие blur(8px). На проде слой растянут `inset: -20%`,
 * то есть выходит за границы контейнера на 20% с каждой стороны — в ТЗ этого нет.
 * На устройствах с < 3 ГБ ОЗУ заменяется статичным PNG (§12).
 */
/**
 * Сетка граней (.facets) — слой поверх свечения (§7.1).
 *
 * В ТЗ из неё задана только непрозрачность: «непрозрачность слоя на экране
 * приветствия — 0.28 для сетки граней». На проде у слоя opacity 0.5, но там
 * он идёт с mix-blend-mode: screen, которого в RN нет; ТЗ — контракт, поэтому
 * берём его значение. Геометрия полос — в scripts/gen-facets.mjs.
 */
export const facets = {
  opacity: 0.28,
} as const;

export const glowField = {
  /** inset: -20% — доля от размера контейнера, на которую слой выходит за края. */
  insetRatio: -0.2,
  blurRadius: 8,
  layers: [
    { color: 'rgba(255,46,99,0.22)', cx: '72%', cy: '18%', rx: '40%', ry: '50%', stop: '70%' },
    { color: 'rgba(190,10,51,0.20)', cx: '22%', cy: '88%', rx: '46%', ry: '56%', stop: '72%' },
    { color: 'rgba(229,16,63,0.10)', cx: '50%', cy: '120%', rx: '60%', ry: '70%', stop: '70%' },
  ],
} as const;

// ---------------------------------------------------------------------------
// Геометрия (§7.3)
// ---------------------------------------------------------------------------

export const radius = {
  composer: 24,
  card: 14,
  button: 12,
  row: 10,
  topButton: 10,
  send: 12,
  modal: 20,
  chip: 999,
  userBubble: { topLeft: 20, topRight: 20, bottomRight: 6, bottomLeft: 20 },
} as const;

export const size = {
  topBarHeight: 56,
  topButton: 38,
  sendButton: 38,
  actionButton: 32,
  /** Иконка внутри кнопки действия 32×32 (§7.3). */
  actionIcon: 16,
  newChatButtonHeight: 42,
  searchRowHeight: 38,
  chatRowMinHeight: 34,
  /** На телефоне: min(86% ширины экрана, 320). */
  drawerWidth: 270,
  drawerWidthRatio: 0.86,
  drawerWidthMax: 320,
  /** Планшет; на телефоне контент во всю ширину. */
  contentMaxWidth: 760,
  /** Порог планшетной раскладки — сетка карточек 2×2 (§7.4). */
  tabletBreakpoint: 768,
  assistantAvatar: 34,
  /** Логотип в пустом состоянии чата (§7.5) и в шапке drawer (§8.4). */
  logo: 72,
  logoDrawer: 32,
  /** Знак внутри кружка аватара 34 — с полями по краям. */
  assistantAvatarGlyph: 18,
  /** Значок часов у сообщения в очереди (§5.5). */
  queuedIcon: 13,
  /** Логотип-индикатор внутри кнопки: по высоте строки, чтобы не прыгала. */
  buttonSpinner: 22,
  /** Ширина мерцающей области «Фикр дорам…» (§7.5). */
  shimmerWidth: 160,
  /** Блочная формула крупнее строчной — как в вебе (§7.6). */
  displayMathScale: 1.15,
  composerMaxHeight: 220,
  /** Требование Apple HIG — не меньше 44×44 pt. */
  minTouchTarget: 44,
} as const;

// ---------------------------------------------------------------------------
// Типографика (§7.2)
//
// ВАЖНО, отклонение от ТЗ. Приложение B задаёт body: Rubik, display:
// BricolageGrotesque. Оба шрифта проваливают критерий приёмки §17:
//   • Bricolage Grotesque не содержит кириллицы вообще;
//   • Rubik не содержит Ҳ/ҳ (U+04B2/U+04B3) — в cyrillic-ext пропущены
//     1202–1205, а «ҳ» есть почти в каждой таджикской строке.
// На вебе это скрыто поглифным фолбэком браузера на sans-serif; в RN фолбэка
// нет, вместо буквы получается □. По §7.2 п.3 берём Inter — полное покрытие
// всех шести таджикских пар.
//
// В RN fontWeight на кастомных шрифтах ненадёжен (особенно на Android), поэтому
// каждое начертание регистрируется отдельным family и выбирается через
// fontFamilyFor(). Числовой вес в токенах остаётся как источник истины.
// ---------------------------------------------------------------------------

export type FontWeightToken = '300' | '400' | '500' | '600' | '700' | '800';

const interFamilies: Record<FontWeightToken, string> = {
  '300': 'Inter-Light',
  '400': 'Inter-Regular',
  '500': 'Inter-Medium',
  '600': 'Inter-SemiBold',
  '700': 'Inter-Bold',
  '800': 'Inter-ExtraBold',
};

export const fontFamily = {
  body: interFamilies,
  /** Display переведён на Inter — см. комментарий выше. */
  display: interFamilies,
  /** Моно оставляем системным (§7.2). На проде это SFMono-Regular. */
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
} as const;

/**
 * Семейство шрифта — СИСТЕМНОЕ.
 *
 * Возврат undefined означает «не задавать fontFamily»: React Native берёт
 * шрифт системы, как это делает ChatGPT на присланном заказчиком скриншоте.
 * Начертания продолжают работать через fontWeight.
 *
 * РИСК, о котором предупреждён заказчик. Inter вшивали именно потому, что он
 * единственный из проверенных содержит все шесть таджикских пар (Ғ ғ, Ӣ ӣ,
 * Қ қ, Ӯ ӯ, Ҳ ҳ, Ҷ ҷ); Rubik из ТЗ, например, не содержит Ҳ и ҳ. На части
 * прошивок Android системный шрифт их тоже не содержит — тогда вместо букв
 * будут квадраты, а это прямое нарушение критерия §17.
 *
 * Поэтому файлы Inter из assets/fonts и плагин expo-font НЕ удалены: если
 * проверка на экране DevGlyphs покажет квадраты, возврат — одна строка ниже.
 */
export function fontFamilyFor(_weight: FontWeightToken): string | undefined {
  return undefined;
}

export type TypographyToken = {
  readonly size: number;
  readonly weight: FontWeightToken;
  /** Коэффициент, НЕ пиксели. В RN lineHeight абсолютный — см. scaleText(). */
  readonly lineHeight?: number;
  /** Уже пересчитан из em при базовом размере: -0.02em × 34 = -0.68. */
  readonly letterSpacing?: number;
  readonly uppercase?: boolean;
  readonly display?: boolean;
};

export const typography = {
  greeting: { size: 34, weight: '600', lineHeight: 1.15, letterSpacing: -0.68, display: true },
  subgreeting: { size: 16, weight: '400' },
  modalTitle: { size: 18, weight: '700', display: true },
  userMessage: { size: 17, weight: '400', lineHeight: 1.5 },
  assistantBody: { size: 17, weight: '400', lineHeight: 1.6 },
  composer: { size: 16, weight: '400', lineHeight: 1.5 },
  chatRow: { size: 13.6, weight: '400' },
  chatRowActive: { size: 13.6, weight: '500' },
  cardCategory: { size: 11.5, weight: '600', uppercase: true, letterSpacing: 0.46 },
  cardText: { size: 14, weight: '400', lineHeight: 1.45 },
  disclaimer: { size: 11.5, weight: '400' },
  caption: { size: 12, weight: '400' },
  /**
   * Длинный документ — политика конфиденциальности на экране регистрации.
   *
   * docHeading равен h3 из .markdown-content прода (16/600): такой же текст,
   * такая же вёрстка, и незачем изобретать вторую шкалу. Сам абзац рисуется
   * assistantBody — это тот самый p с line-height 1.75, снятый с сайта.
   *
   * docSubheading (15/600) — единственное значение здесь БЕЗ прообраза на
   * проде: в CSS сайта h4 не встречается, а в документе подзаголовки вроде
   * «Маълумоти ҳисоб (Account Data)» есть. Взята ступень между h3 и текстом.
   */
  docHeading: { size: 16, weight: '600' },
  docSubheading: { size: 15, weight: '600' },
  newChatButton: { size: 14.5, weight: '500' },
} as const satisfies Record<string, TypographyToken>;

/** 4 ступени размера шрифта в настройках (§7.2, требование брифа §6). */
export const fontScale = { small: 0.9, normal: 1.0, large: 1.15, xlarge: 1.3 } as const;

export type FontScaleName = keyof typeof fontScale;

/**
 * Системное масштабирование включено, но ограничено, чтобы вёрстка не разъезжалась
 * (§7.2). Передавать в каждый <Text>/<TextInput>.
 */
export const MAX_FONT_SIZE_MULTIPLIER = 1.6;

// ---------------------------------------------------------------------------
// Статусные цвета (§7.1 «Прочее»)
// ---------------------------------------------------------------------------

export const status = {
  error: { bg: 'rgba(255,90,110,0.1)', border: 'rgba(255,90,110,0.25)', text: '#ff8a9c' },
  danger: '#ff5a6e',
  warning: '#f1a23a',
  selection: 'rgba(229,16,63,0.32)',
} as const;

// ---------------------------------------------------------------------------
// Хелперы
// ---------------------------------------------------------------------------

/**
 * Превращает типографский токен в RN TextStyle с учётом ступени размера шрифта.
 *
 * Две вещи, которые ломаются при наивном копировании Приложения B:
 *   • lineHeight в токенах — коэффициент, а RN ждёт абсолютные пиксели;
 *   • letterSpacing уже пересчитан из em при БАЗОВОМ размере, поэтому его надо
 *     масштабировать вместе с размером, иначе на ступени 1.3 трекинг «поедет».
 */
export function scaleText(token: TypographyToken, scale: number = fontScale.normal): TextStyle {
  const fontSize = token.size * scale;
  const style: TextStyle = {
    fontSize,
    /**
     * Семейство берётся ТОЛЬКО через fontFamilyFor — единственное место, где
     * решается, системный шрифт или вшитый. Раньше здесь стояла прямая
     * выборка из таблицы Inter, и переключение в fontFamilyFor не меняло
     * ровным счётом ничего: весь основной текст продолжал рисоваться Inter.
     */
    fontFamily: fontFamilyFor(token.weight),
    // Держим и fontWeight: при системном шрифте начертание задаётся только им.
    fontWeight: token.weight,
  };
  if (token.lineHeight !== undefined) {
    style.lineHeight = Math.round(fontSize * token.lineHeight);
  }
  if (token.letterSpacing !== undefined) {
    style.letterSpacing = token.letterSpacing * scale;
  }
  if (token.uppercase) {
    style.textTransform = 'uppercase';
  }
  return style;
}

/**
 * Тень из токена в RN-стиль. iOS получает shadow*, Android — elevation.
 * CSS-spread (`-12px` в `0 24px 60px -12px`) в RN невыразим и опускается:
 * визуально тень будет чуть шире, чем на вебе. Это осознанное приближение.
 */
export function shadow(token: ShadowToken): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: {
      shadowColor: token.color,
      shadowOffset: { width: 0, height: token.offsetY },
      shadowOpacity: token.opacity,
      shadowRadius: token.radius / 2,
    },
    android: {
      elevation: token.elevation,
      // Учитывается только на Android 9+; ниже тень будет нейтрально-серой.
      shadowColor: token.color,
    },
    default: {},
  });
}

/** Ширина drawer: 270 на планшете, min(86% экрана, 320) на телефоне (§7.3). */
export function drawerWidthFor(screenWidth: number): number {
  if (screenWidth >= size.tabletBreakpoint) return size.drawerWidth;
  return Math.min(screenWidth * size.drawerWidthRatio, size.drawerWidthMax);
}
