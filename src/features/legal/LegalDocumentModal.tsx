import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Button } from '../../design/components';
import {
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  ruby,
  scaleText,
  shadow,
  typography,
} from '../../design/tokens';
import { useFontScale, useTheme } from '../../store/settings';
import type { LegalDocument } from './privacyPolicy';

/**
 * Юридический документ во весь экран поверх формы (§8.2).
 *
 * ПОЧЕМУ МОДАЛКА, А НЕ ЭКРАН В СТЕКЕ. Читают документ, не уходя из формы:
 * набранные имя, почта и пароль остаются на месте, потому что экран
 * регистрации не размонтируется. Переход на отдельный экран стека сбросил бы
 * состояние формы, и после чтения политики всё пришлось бы вводить заново.
 *
 * Текст прокручивается, кнопка закрытия закреплена снизу и не уезжает вместе
 * с ним: документ длинный, и на маленьком экране искать выход в конце
 * пятнадцати экранов текста — то же самое, что не иметь выхода.
 */
export function LegalDocumentModal({
  visible,
  document,
  onClose,
}: {
  visible: boolean;
  document: LegalDocument;
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
      // Аппаратная «назад» на Android закрывает документ — иначе из него не выйти.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.scrim, { backgroundColor: theme.scrim }]}>
        <View
          testID="legal-modal"
          style={[
            styles.card,
            shadow(theme.shadowLg),
            {
              backgroundColor: theme.bg1,
              borderColor: theme.border,
              marginTop: insets.top + 24,
              marginBottom: insets.bottom + 24,
            },
          ]}
        >
          <View style={styles.header}>
            <Text
              style={[scaleText(typography.modalTitle, scale), { color: theme.text }]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
            >
              {document.title}
            </Text>
            <Text
              style={[scaleText(typography.caption, scale), { color: theme.text3 }]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
            >
              {document.date}
            </Text>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            // Полоса прокрутки здесь не украшение: она единственная показывает,
            // что документ длинный, и сколько ещё осталось.
            showsVerticalScrollIndicator
          >
            {document.sections.map((section, sectionIndex) => (
              <View key={section.heading ?? sectionIndex} style={styles.section}>
                {section.heading ? (
                  <Text
                    accessibilityRole="header"
                    style={[scaleText(typography.docHeading, scale), { color: theme.text }]}
                    maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
                  >
                    {section.heading}
                  </Text>
                ) : null}

                {section.blocks.map((block, blockIndex) => {
                  if (block.kind === 'subheading') {
                    return (
                      <Text
                        key={blockIndex}
                        accessibilityRole="header"
                        style={[
                          scaleText(typography.docSubheading, scale),
                          { color: theme.text2 },
                        ]}
                        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
                      >
                        {block.text}
                      </Text>
                    );
                  }

                  if (block.kind === 'bullets') {
                    return (
                      <View key={blockIndex} style={styles.bullets}>
                        {block.items.map((item) => (
                          <View key={item} style={styles.bulletRow}>
                            {/*
                              Маркер — точка на View, а не символ «•» в тексте:
                              её цвет берётся из ruby400, как li::marker в вебе,
                              и она не зависит от того, есть ли этот глиф в
                              шрифте (§17 — та же причина, по которой из
                              интерфейса убрали эмодзи).
                            */}
                            <View
                              style={[
                                styles.bulletDot,
                                {
                                  backgroundColor: ruby.r400,
                                  marginTop: 10 * scale,
                                },
                              ]}
                            />
                            <Text
                              style={[
                                styles.bulletText,
                                scaleText(typography.assistantBody, scale),
                                { color: theme.text },
                              ]}
                              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
                            >
                              {item}
                            </Text>
                          </View>
                        ))}
                      </View>
                    );
                  }

                  return (
                    <Text
                      key={blockIndex}
                      style={[scaleText(typography.assistantBody, scale), { color: theme.text }]}
                      maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
                    >
                      {block.text}
                    </Text>
                  );
                })}
              </View>
            ))}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Button label={t('common.close')} onPress={onClose} testID="legal-modal-close" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center' },
  /**
   * flexShrink, а не фиксированная высота: карточка занимает столько, сколько
   * есть, и упирается в отступы безопасной зоны. На крупной ступени шрифта
   * (§7.2, 1.3×) фиксированная высота отрезала бы кнопку закрытия.
   */
  card: {
    flexShrink: 1,
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: radius.modal,
    overflow: 'hidden',
  },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, gap: 4 },
  body: { flexShrink: 1 },
  bodyContent: { paddingHorizontal: 20, paddingBottom: 20, gap: 18 },
  section: { gap: 10 },
  bullets: { gap: 8 },
  bulletRow: { flexDirection: 'row', gap: 10 },
  bulletDot: { width: 5, height: 5, borderRadius: 2.5 },
  bulletText: { flex: 1 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16 },
});
