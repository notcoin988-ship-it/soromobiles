import React, { memo, useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { MAX_FONT_SIZE_MULTIPLIER, fontFamily, scaleText, typography } from '../../design/tokens';
import { useFontScale, useTheme } from '../../store/settings';
import { applyColor, texToSvg } from './mathjax';

/**
 * Одна формула LaTeX (§7.6).
 *
 * MathJax отдаёт размеры в ex — это высота строчной «x» текущего шрифта.
 * Пересчитываем в пиксели через размер текста, поэтому формула растёт вместе
 * с настройкой размера шрифта (§7.2, четыре ступени), а не остаётся мелкой.
 *
 * Если преобразовать не удалось — показываем исходный текст формулы. Это
 * лучше пустого места: школьник хотя бы увидит, что модель что-то ответила,
 * и сможет разобрать запись сам.
 */

/** Доля от размера шрифта, приходящаяся на 1ex. Для Inter ≈ 0.52. */
const EX_RATIO = 0.52;

export const MathFormula = memo(function MathFormula({
  tex,
  display,
  fontSize,
}: {
  tex: string;
  display: boolean;
  fontSize: number;
}) {
  const theme = useTheme();
  const scale = useFontScale();

  const result = useMemo(() => texToSvg(tex, display), [tex, display]);
  const colored = useMemo(
    () => (result.svg === null ? null : applyColor(result.svg, theme.text)),
    [result.svg, theme.text],
  );

  if (colored === null) {
    return (
      <Text
        style={[scaleText(typography.assistantBody, scale), styles.fallback, { color: theme.text }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {tex}
      </Text>
    );
  }

  const unit = fontSize * EX_RATIO;

  return (
    <SvgXml
      xml={colored}
      width={result.width * unit}
      height={result.height * unit}
      // Формула — часть ответа; для программы чтения с экрана озвучиваем
      // исходную запись, иначе она молча пропустит весь блок.
      accessibilityLabel={tex}
    />
  );
});

const styles = StyleSheet.create({
  // Моноширинный вид у неразобранной формулы: сразу видно, что это запись,
  // а не обычный текст ответа.
  fallback: { fontFamily: fontFamily.mono },
});
