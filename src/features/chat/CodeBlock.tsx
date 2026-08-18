import React, { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';

import { Icon } from '../../design/Icon';
import {
  MAX_FONT_SIZE_MULTIPLIER,
  fontFamily,
  radius,
  ruby,
  scaleText,
  size,
  typography,
} from '../../design/tokens';
import { useFontScale, useTheme } from '../../store/settings';

/**
 * Блок кода в ответе модели (§7.6): фон bg2, рамка 1px border, радиус 12,
 * паддинг 14/16, горизонтальный скролл, кнопка «Нусха» в правом верхнем углу.
 *
 * Кнопка здесь не украшение: выделить код пальцем на телефоне почти
 * невозможно — долгий тап перехватывает прокрутка, а сам блок ещё и ездит
 * по горизонтали.
 *
 * Горизонтальный скролл внутри СВОЕГО контейнера: §7.6 требует, чтобы
 * страница по горизонтали не двигалась никогда.
 */
export const CodeBlock = memo(function CodeBlock({ code }: { code: string }) {
  const theme = useTheme();
  const scale = useFontScale();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.block, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text
          style={[
            scaleText(typography.assistantBody, scale),
            styles.code,
            { color: theme.text2 },
          ]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {code.replace(/\n$/, '')}
        </Text>
      </ScrollView>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.copy')}
        onPress={() => void copy()}
        hitSlop={8}
        style={[styles.copy, { backgroundColor: theme.bg3, borderColor: theme.border }]}
        testID="code-copy"
      >
        <Icon
          name={copied ? 'check' : 'copy'}
          size={size.actionIcon}
          color={copied ? ruby.r400 : theme.text3}
        />
        <Text
          style={[scaleText(typography.caption, scale), { color: copied ? ruby.r400 : theme.text3 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {copied ? t('common.copied') : t('common.copy')}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  block: {
    borderWidth: 1,
    borderRadius: radius.button,
    paddingVertical: 14,
    paddingHorizontal: 16,
    // Место под кнопку, чтобы она не наезжала на первую строку кода.
    paddingTop: 40,
    marginVertical: 8,
  },
  code: { fontFamily: fontFamily.mono },
  copy: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: radius.row,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
});
