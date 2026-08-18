import React from 'react';
import {
  InteractionManager,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { SheetAction } from './actionSheetTypes';
import { MAX_FONT_SIZE_MULTIPLIER, radius, ruby, scaleText, shadow, typography } from './tokens';
import { useFontScale, useTheme } from '../store/settings';

/**
 * Список действий снизу экрана.
 *
 * ПОЧЕМУ НЕ Alert.alert. Проверка на устройстве показала: Android рисует
 * системным диалогом РОВНО ТРИ кнопки (positive / negative / neutral), а всё
 * лишнее молча выбрасывает. Меню ответа по §8.3 состоит из семи пунктов, а
 * жалоба — из пяти; на экране оставались первые три, и до «Дигар» и «Бекор»
 * добраться было нельзя вообще. Молча — то есть ни ошибки, ни предупреждения:
 * на эмуляторе было видно только три зелёные надписи в ряд.
 *
 * Поэтому свой лист: пунктов сколько угодно, каждый читается целиком, а не
 * капсом в одну строку, и порядок сохраняется.
 */

export type { SheetAction };

export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  /** Необязательный заголовок над списком. */
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const theme = useTheme();
  const scale = useFontScale();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Аппаратная «назад» на Android закрывает лист — иначе из него не выйти.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Тап по затемнению — отмена, привычное поведение на обеих платформах. */}
      <Pressable style={[styles.scrim, { backgroundColor: theme.scrim }]} onPress={onClose}>
        {/*
          Внутренний Pressable без обработчика гасит всплытие: тап по самому
          листу не должен считаться тапом по затемнению.
        */}
        <Pressable
          style={[
            styles.sheet,
            shadow(theme.shadowLg),
            {
              backgroundColor: theme.bg2,
              borderColor: theme.border,
              paddingBottom: insets.bottom + 8,
            },
          ]}
          onPress={() => {}}
        >
          {title ? (
            <Text
              style={[styles.title, scaleText(typography.caption, scale), { color: theme.text3 }]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
            >
              {title}
            </Text>
          ) : null}

          {/*
            Список прокручиваемый: на крупной ступени шрифта (§7.2, 1.3×) семь
            пунктов в маленький экран не помещаются, и без прокрутки нижние
            оказались бы за краем — та же беда, что и с системным диалогом.
          */}
          <ScrollView bounces={false} style={styles.list}>
            {actions.map((action, index) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                onPress={() => {
                  onClose();
                  /**
                   * Действие — ПОСЛЕ того, как лист уедет с экрана.
                   *
                   * Вызов сразу за onClose выглядит правильнее, но ломает всё,
                   * что просит фокус: переименование чата открывает поле с
                   * autoFocus, закрывающаяся модалка тут же забирает фокус
                   * себе, срабатывает onBlur — и правка отменяется, не начавшись.
                   * На устройстве это выглядело так: поле мигает и исчезает,
                   * имя чата прежнее.
                   */
                  InteractionManager.runAfterInteractions(action.onPress);
                }}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed ? theme.bg3 : 'transparent',
                    borderTopColor: theme.border,
                    borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Text
                  style={[
                    scaleText(typography.cardText, scale),
                    { color: action.destructive ? ruby.r400 : theme.text },
                  ]}
                  maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancel,
              { backgroundColor: pressed ? theme.bg3 : theme.bg4 },
            ]}
          >
            <Text
              style={[scaleText(typography.cardText, scale), { color: theme.text2 }]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
            >
              {t('common.cancel')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.modal,
    borderTopRightRadius: radius.modal,
    borderWidth: 1,
    paddingTop: 8,
    paddingHorizontal: 8,
    gap: 8,
  },
  title: { paddingHorizontal: 12, paddingTop: 4, textTransform: 'uppercase' },
  // Потолок высоты, а не фиксированная: коротким спискам лишнего места не нужно.
  list: { maxHeight: 420, flexGrow: 0 },
  row: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: radius.row },
  cancel: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: radius.button,
  },
});
