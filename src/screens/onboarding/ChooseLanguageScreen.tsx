import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../design/components';
import { Logo } from '../../design/Logo';
import {
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  ruby,
  scaleText,
  size,
  typography,
} from '../../design/tokens';
import { LANGUAGES, type Language } from '../../i18n';
import { useFontScale, useSettingsStore, useTheme } from '../../store/settings';

/**
 * Первый экран первого запуска (§8.1): выбор языка.
 *
 * Таджикский ПРЕДВЫБРАН — это состояние по умолчанию в настройках (§9), и
 * человеку, которому он и нужен, достаточно одного тапа по «Идома». Три тапа
 * до экрана входа из критерия §8.1 складываются так: «Идома» здесь, галочка
 * согласия и «Идома» на дисклеймере.
 *
 * Названия языков не переводятся: «Русский» пишется по-русски на любом языке
 * интерфейса, иначе выбрать нужный сможет только тот, кто уже понимает
 * текущий.
 */
export default function ChooseLanguageScreen({ onContinue }: { onContinue: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();
  const insets = useSafeAreaInsets();

  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg0, paddingTop: insets.top + 24 }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Logo width={size.logo} />

        <Text
          style={[scaleText(typography.modalTitle, scale), styles.title, { color: theme.text }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('onboarding.chooseLanguage')}
        </Text>

        <View style={styles.list}>
          {LANGUAGES.map((code) => {
            const selected = language === code;
            return (
              <Pressable
                key={code}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                testID={`onboarding-language-${code}`}
                // Смена языка применяется СРАЗУ: подпись кнопки «Идома» под
                // пальцем меняется на выбранный язык, и человек видит, что
                // выбор сработал, ещё до перехода дальше.
                onPress={() => setLanguage(code)}
                style={({ pressed }) => [
                  styles.row,
                  {
                    backgroundColor: pressed ? theme.bg3 : theme.bg2,
                    borderColor: selected ? ruby.r600 : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    scaleText(typography.cardText, scale),
                    { color: selected ? ruby.r400 : theme.text },
                  ]}
                  maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
                >
                  {LANGUAGE_LABELS[code]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label={t('onboarding.continue')}
          onPress={onContinue}
          testID="onboarding-language-continue"
        />
      </View>
    </View>
  );
}

/** Самоназвания языков — не переводятся (см. комментарий выше). */
const LANGUAGE_LABELS: Record<Language, string> = {
  tg: 'Тоҷикӣ',
  ru: 'Русский',
  en: 'English',
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 24, gap: 20, alignItems: 'center' },
  title: { textAlign: 'center' },
  list: { alignSelf: 'stretch', gap: 10 },
  row: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: radius.card,
    minHeight: size.minTouchTarget, // §7.3
    justifyContent: 'center',
  },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
});
