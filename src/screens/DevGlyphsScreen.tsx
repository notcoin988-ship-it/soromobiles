import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  MAX_FONT_SIZE_MULTIPLIER,
  fontScale,
  ruby,
  scaleText,
  themes,
  typography,
  type FontScaleName,
  type FontWeightToken,
  type Theme,
  type ThemeName,
} from '../design/tokens';

/**
 * Экран-пробник таджикских глифов (§7.2 п.4).
 *
 * Из него делаются скриншоты для критерия приёмки §17: «0 квадратов вместо
 * таджикских букв». Не удалять после этапа 1 — при каждой смене шрифта или
 * начертания проверка повторяется.
 *
 * Почему это вообще нужно. В вебе цепочка `Bricolage Grotesque, Rubik,
 * sans-serif` подставляет недостающий глиф поглифно, поэтому дефект не виден.
 * В React Native фолбэка нет: если в подключённом .ttf глифа нет, будет □.
 * Проверено по метаданным Google Fonts:
 *   • Bricolage Grotesque — кириллицы нет вообще;
 *   • Rubik — нет Ҳ/ҳ (U+04B2/U+04B3), в cyrillic-ext пропущены 1202–1205;
 *   • Inter — покрывает все шесть пар, поэтому выбран он (§7.2 п.3).
 */

/** Шесть таджикских пар из §17 — ровно те, что перечислены в критерии приёмки. */
const TAJIK_PAIRS = [
  { pair: 'ғҒ', codepoints: 'U+0493 U+0492' },
  { pair: 'ӣӢ', codepoints: 'U+04E3 U+04E2' },
  { pair: 'қҚ', codepoints: 'U+049B U+049A' },
  { pair: 'ӯӮ', codepoints: 'U+04EF U+04EE' },
  { pair: 'ҳҲ', codepoints: 'U+04B3 U+04B2' },
  { pair: 'ҷҶ', codepoints: 'U+04B7 U+04B6' },
] as const;

const GLYPH_LINE = TAJIK_PAIRS.map((p) => p.pair).join(' ');

const WEIGHTS: FontWeightToken[] = ['300', '400', '500', '600', '700', '800'];
const SCALES: FontScaleName[] = ['small', 'normal', 'large', 'xlarge'];

/**
 * Реальные строки из Приложения C, в которых «ҳ» встречается — именно на них
 * дефект Rubik был бы заметен пользователю, а не на синтетическом наборе.
 */
/**
 * Заголовки категорий капсом с карточек-подсказок (§7.5). Вынесены в константу,
 * а не оставлены литералом в JSX: §9 запрещает строки в коде компонентов, и
 * линтер это проверяет. Здесь это образец шрифта, а не текст интерфейса,
 * поэтому в i18n-файлы он не идёт.
 */
const CARD_CATEGORIES_CAPS = 'ТАЪРИХ · ҶУҒРОФИЯ · АДАБИЁТ · САЙЁҲӢ';

const REAL_STRINGS = [
  'Ҳанӯз чате нест. Суҳбати навро оғоз кунед!',
  'Шартҳои хизматрасонӣ',
  'Кӯмак ва саволҳо',
  'Ҷойҳои ҷолибтарин барои сайёҳон дар Помир',
  'Баландтарин қуллаҳои кӯҳии Тоҷикистон кадомҳоянд?',
  'Имрӯз чӣ гуна метавонам кӯмак кунам?',
  'Soro метавонад хато кунад. Маълумоти муҳимро санҷед.',
];

function Section({ title, theme, children }: { title: string; theme: Theme; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[scaleText(typography.cardCategory), { color: ruby.r300 }]}>{title}</Text>
      <View style={[styles.card, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
        {children}
      </View>
    </View>
  );
}

export default function DevGlyphsScreen() {
  const [themeName, setThemeName] = useState<ThemeName>('dark');
  const theme = themes[themeName];

  return (
    <ScrollView
      style={{ backgroundColor: theme.bg0 }}
      contentContainerStyle={styles.content}
      testID="glyph-proof"
    >
      <Pressable
        onPress={() => setThemeName((t) => (t === 'dark' ? 'light' : 'dark'))}
        style={[styles.toggle, { backgroundColor: theme.bg3, borderColor: theme.borderStrong }]}
      >
        <Text style={[scaleText(typography.newChatButton), { color: theme.text }]}>
          {themeName === 'dark' ? 'Торик → Равшан' : 'Равшан → Торик'}
        </Text>
      </Pressable>

      <Section title="Ҳарфҳои тоҷикӣ" theme={theme}>
        {TAJIK_PAIRS.map(({ pair, codepoints }) => (
          <View key={pair} style={styles.row}>
            <Text style={[scaleText({ size: 28, weight: '500' }), { color: theme.text }]}>
              {pair}
            </Text>
            <Text style={[scaleText(typography.caption), { color: theme.text3 }]}>{codepoints}</Text>
          </View>
        ))}
      </Section>

      <Section title="Ҳамаи вазнҳо" theme={theme}>
        {WEIGHTS.map((weight) => (
          <View key={weight} style={styles.row}>
            <Text style={[scaleText(typography.caption), { color: theme.text3 }]}>{weight}</Text>
            <Text style={[scaleText({ size: 20, weight }), { color: theme.text }]}>{GLYPH_LINE}</Text>
          </View>
        ))}
      </Section>

      <Section title="Ҳамаи андозаҳо" theme={theme}>
        {SCALES.map((name) => (
          <View key={name} style={styles.row}>
            <Text style={[scaleText(typography.caption), { color: theme.text3 }]}>
              {`${name} ×${fontScale[name]}`}
            </Text>
            <Text
              style={[scaleText(typography.assistantBody, fontScale[name]), { color: theme.text }]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
            >
              {GLYPH_LINE}
            </Text>
          </View>
        ))}
      </Section>

      <Section title="Сатрҳои воқеӣ" theme={theme}>
        {REAL_STRINGS.map((line) => (
          <Text
            key={line}
            style={[scaleText(typography.assistantBody), styles.realLine, { color: theme.text2 }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {line}
          </Text>
        ))}
      </Section>

      <Section title="Капс дар кортҳо" theme={theme}>
        {/* Капс отдельно: у прописных таджикских глифов свой набор проблем. */}
        <Text style={[scaleText(typography.cardCategory), { color: ruby.r300 }]}>
          {CARD_CATEGORIES_CAPS}
        </Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 60, gap: 20 },
  section: { gap: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  realLine: { marginBottom: 2 },
  toggle: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
});
