import React, { useMemo } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { MAX_FONT_SIZE_MULTIPLIER, ruby, scaleText, typography } from '../../design/tokens';
import { useFontScale, useTheme } from '../../store/settings';
import { parseLegalConsent, type ConsentLinkName } from './legalConsent';

/**
 * Предложение с названиями документов-ссылками внутри. Используется дважды:
 * строкой согласия под формой регистрации (§8.2, `auth.legalConsent`) и
 * подписью к чекбоксу на экране дисклеймера (§8.1, `onboarding.consent`).
 *
 * Ссылки — вложенные <Text>, а не Pressable: Pressable внутри строки текста на
 * Android выпадает из потока и встаёт отдельным блоком, разрывая предложение
 * посередине. Вложенный <Text onPress> рисуется в строке на обеих платформах.
 *
 * Цель нажатия у такой ссылки меньше 44pt из §7.3 — иначе строка не была бы
 * строкой. Это осознанно: тот же документ открывается из настроек отдельной
 * строкой в полный ряд, где размер цели соблюдён.
 */
export function LegalConsentText({
  textKey = 'auth.legalConsent',
  style,
  onPressLink,
}: {
  /** Ключ i18n с разметкой <terms>…</terms> и <privacy>…</privacy>. */
  textKey?: string;
  style?: StyleProp<TextStyle>;
  onPressLink: (name: ConsentLinkName) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();

  const segments = useMemo(() => parseLegalConsent(t(textKey)), [t, textKey]);

  return (
    <Text
      style={[
        styles.line,
        scaleText(typography.disclaimer, scale),
        { color: theme.text3 },
        style,
      ]}
      maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
    >
      {segments.map((segment, index) =>
        segment.kind === 'link' ? (
          <Text
            key={index}
            accessibilityRole="link"
            onPress={() => onPressLink(segment.name)}
            style={styles.link}
            testID={`consent-link-${segment.name}`}
          >
            {segment.text}
          </Text>
        ) : (
          <Text key={index}>{segment.text}</Text>
        ),
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  // По левому краю: строка стоит подписью к чекбоксу, а не отдельным абзацем.
  line: { textAlign: 'left' },
  // ruby400 с подчёркиванием — как ссылка в .markdown-content на проде.
  link: { color: ruby.r400, textDecorationLine: 'underline' },
});
