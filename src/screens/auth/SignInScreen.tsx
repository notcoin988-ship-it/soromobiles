import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorBanner, Field, LinkButton } from '../../design/components';
import { CrystalField } from '../../design/CrystalField';
import { Logo } from '../../design/Logo';
import { MAX_FONT_SIZE_MULTIPLIER, scaleText, typography } from '../../design/tokens';
import { useAuthStore } from '../../features/auth/authStore';
import { hasErrors, validateSignIn, type FormErrors, type SignInForm } from '../../features/auth/validation';
import { useFontScale, useTheme } from '../../store/settings';

/**
 * Экран входа (§8.2).
 *
 * Только почта и пароль. Кнопок Google, Apple и входа по номеру телефона здесь
 * нет — §8.2 запрещает. Побочный плюс: пока нет стороннего входа, Apple не
 * требует добавлять Sign in with Apple (Guideline 4.8).
 */
export default function SignInScreen({
  onSignUp,
  onForgotPassword,
}: {
  onSignUp: () => void;
  onForgotPassword: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();

  const signIn = useAuthStore((s) => s.signIn);
  const busy = useAuthStore((s) => s.busy);
  const serverErrors = useAuthStore((s) => s.fieldErrors);
  const formError = useAuthStore((s) => s.formError);
  const clearErrors = useAuthStore((s) => s.clearErrors);

  const [form, setForm] = useState<SignInForm>({ email: '', password: '' });
  const [localErrors, setLocalErrors] = useState<FormErrors<SignInForm>>({});
  const [secure, setSecure] = useState(true);

  const patch = (key: keyof SignInForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setLocalErrors((prev) => ({ ...prev, [key]: undefined }));
    clearErrors();
  };

  const submit = () => {
    const errors = validateSignIn(form);
    setLocalErrors(errors);
    if (hasErrors(errors)) return;
    void signIn(form.email, form.password);
  };

  const errorFor = (key: 'email' | 'password') => {
    const key2 = localErrors[key] ?? serverErrors[key];
    return key2 ? t(key2) : undefined;
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.bg0 }]}
      // На Android поле ввода поднимается через windowSoftInputMode=adjustResize,
      // заданный в app.config.ts (§7.4), поэтому здесь поведение только для iOS.
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Фон: кристаллы дрейфуют под содержимым, касания сквозь них проходят. */}
      <CrystalField />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Логотип над заголовком — как на экране входа sorollm.tj (§17). */}
        <Logo style={styles.logo} />

        <Text
          style={[scaleText(typography.greeting, scale), { color: theme.text }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('auth.welcomeTitle')}
        </Text>
        <Text
          style={[scaleText(typography.subgreeting, scale), { color: theme.text2 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('auth.continueToSignIn')}
        </Text>

        {formError ? <ErrorBanner message={t(formError)} /> : null}

        <Field
          label={t('auth.email')}
          value={form.email}
          onChangeText={patch('email')}
          error={errorFor('email')}
          // Настроено так, чтобы работали менеджеры паролей и автозаполнение (§8.2).
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          testID="signin-email"
        />

        <Field
          label={t('auth.password')}
          value={form.password}
          onChangeText={patch('password')}
          error={errorFor('password')}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          onToggleSecure={() => setSecure((v) => !v)}
          toggleSecureLabel={secure ? t('auth.showPassword') : t('auth.hidePassword')}
          onSubmitEditing={submit}
          returnKeyType="go"
          testID="signin-password"
        />

        <Button label={t('auth.signIn')} onPress={submit} loading={busy} testID="signin-submit" />

        <View style={styles.links}>
          <LinkButton label={t('auth.forgotPassword')} onPress={onForgotPassword} />
          <LinkButton label={t('auth.noAccount')} onPress={onSignUp} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' },
  logo: { alignSelf: 'center' },
  links: { gap: 4, alignItems: 'flex-start' },
});
