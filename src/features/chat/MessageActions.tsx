import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Icon } from '../../design/Icon';
import type { IconName } from '../../design/iconPaths';
import { MAX_FONT_SIZE_MULTIPLIER, radius, scaleText, size, typography } from '../../design/tokens';
import { useFontScale, useTheme } from '../../store/settings';
import { useMessageMenu } from './useMessageMenu';

/**
 * Ряд действий под завершённым ответом: копировать и перегенерировать,
 * справа подпись модели.
 *
 * Кнопки 32×32 с иконкой 16 (§7.3). Под незавершённым ответом ряд не
 * показывается — копировать и переспрашивать ещё нечего.
 *
 * ОТКЛОНЕНИЕ ОТ §8.3. Раньше здесь были ещё «Объясни проще», оценка 👍/👎 и
 * жалоба — их убрали по решению заказчика ради вида, близкого к ChatGPT.
 * Вместе с ними отпали критерий §17 «оценка ответа и жалоба на ответ
 * работают» и задача бэкенда B11; жалобу на контент вдобавок обычно
 * спрашивает модерация App Store у AI-приложений. Решение согласовано.
 */

export function MessageActions({
  messageId,
  content,
  model,
  onRegenerate,
}: {
  messageId: string;
  content: string;
  model?: string | null;
  onRegenerate: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();

  /**
   * Из общего хука здесь нужно только копирование — вместе с состоянием
   * «скопировано», по которому иконка на две секунды меняется на галочку.
   *
   * Лист меню по долгому тапу отсюда НЕ рисуется. Он рисуется в
   * components.tsx, рядом с самим текстом ответа, который этот долгий тап и
   * ловит. Раньше лист рендерился в обоих местах: два экземпляра хука — два
   * независимых состояния, и здешний экземпляр открыть было нечем, потому что
   * кнопки «…» в ряду нет. Под каждым ответом в ленте висел Modal, который не
   * мог показаться никогда.
   */
  const { copy, copied } = useMessageMenu({ messageId, content, model });

  return (
    <View style={styles.row}>
      {/* Иконки из собственного набора (§4.2), а не эмодзи: эмодзи рисуются
          системным шрифтом и выглядят по-разному на каждом Android. */}
      <Action icon={copied ? 'check' : 'copy'} onPress={() => void copy()} hint={t('common.copy')} />
      <Action icon="refresh" onPress={onRegenerate} hint={t('chat.regenerate')} />

      <View style={styles.spacer} />

      {model ? (
        <Text
          style={[scaleText(typography.caption, scale), { color: theme.text3 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {model}
        </Text>
      ) : null}
    </View>
  );
}

function Action({
  icon,
  hint,
  onPress,
}: {
  icon: IconName;
  hint: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.action,
        { backgroundColor: pressed ? theme.bg3 : 'transparent' },
      ]}
    >
      {/* Кнопка 32×32, иконка 16 (§7.3). */}
      <Icon name={icon} size={size.actionIcon} color={theme.text3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 },
  action: {
    width: size.actionButton,
    height: size.actionButton,
    borderRadius: radius.row,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spacer: { flex: 1 },
});
