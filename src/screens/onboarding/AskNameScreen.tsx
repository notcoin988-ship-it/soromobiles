import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field } from '../../design/components';
import { Logo } from '../../design/Logo';
import { MAX_FONT_SIZE_MULTIPLIER, scaleText, size, typography } from '../../design/tokens';
import { useFontScale, useTheme } from '../../store/settings';

/**
 * Второй экран первого запуска (§8.1): как к человеку обращаться.
 *
 * ЗАЧЕМ ОН НУЖЕН ОТДЕЛЬНО. Раньше имя спрашивала форма регистрации, но она
 * ушла вместе с почтой и паролем: вход теперь только через Google. Google
 * присылает имя из профиля аккаунта — иногда это «Иван И.», иногда латиница,
 * иногда рабочее ФИО целиком. Приветствие в чате должно звучать так, как
 * человек сам себя называет, поэтому спрашиваем один раз здесь.
 *
 * Имя остаётся НА УСТРОЙСТВЕ (store/onboarding). Отправлять его на сервер
 * некуда: ручки правки профиля в API нет, а перезаписывать им имя аккаунта
 * Google мы не вправе.
 *
 * Экран стоит ДО входа, а не после: он часть первого запуска, и три экрана
 * §8.1 складываются как язык → имя → дисклеймер.
 */
export default function AskNameScreen({ onContinue }: { onContinue: (name: string) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [error, setError] = useState(false);

  const submit = () => {
    if (!name.trim()) {
      // Кнопка НЕ заблокирована — как на дисклеймере: неактивная кнопка на
      // нажатие не отвечает ничем, и человек не понимает, чего от него хотят.
      setError(true);
      return;
    }
    onContinue(name);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.bg0, paddingTop: insets.top + 24 }]}
      // На Android поле поднимается через windowSoftInputMode=adjustResize из
      // app.config.ts (§7.4), поэтому поведение задаётся только для iOS.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Logo width={size.logo} />

        <Text
          style={[scaleText(typography.modalTitle, scale), styles.title, { color: theme.text }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('onboarding.nameTitle')}
        </Text>

        <Text
          style={[scaleText(typography.subgreeting, scale), styles.title, { color: theme.text2 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('onboarding.nameHint')}
        </Text>

        <View style={styles.field}>
          <Field
            label={t('onboarding.nameLabel')}
            value={name}
            onChangeText={(value) => {
              setName(value);
              setError(false);
            }}
            error={error ? t('onboarding.nameRequired') : undefined}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="name"
            textContentType="givenName"
            returnKeyType="done"
            onSubmitEditing={submit}
            testID="onboarding-name"
          />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label={t('onboarding.continue')}
          onPress={submit}
          testID="onboarding-name-continue"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 24, gap: 20, alignItems: 'center' },
  title: { textAlign: 'center' },
  field: { alignSelf: 'stretch' },
  footer: { paddingHorizontal: 24, paddingTop: 8 },
});
