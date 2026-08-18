import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorBanner, Field, LinkButton } from '../../design/components';
import { MAX_FONT_SIZE_MULTIPLIER, scaleText, typography } from '../../design/tokens';
import { useAuthStore } from '../../features/auth/authStore';
import { validateEmail } from '../../features/auth/validation';
import { useFontScale, useTheme } from '../../store/settings';

/**
 * Восстановление пароля, шаг 1 (§8.2): почта → код из письма.
 *
 * Сервер ВСЕГДА отвечает 202, независимо от того, существует ли аккаунт
 * (§6.6) — чтобы не раскрывать наличие пользователя. Поэтому экран всегда
 * ведёт дальше и никогда не сообщает «такой почты нет».
 */
export default function ForgotPasswordScreen({
  onSent,
  onBack,
}: {
  onSent: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();

  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const busy = useAuthStore((s) => s.busy);
  const formError = useAuthStore((s) => s.formError);
  const clearErrors = useAuthStore((s) => s.clearErrors);

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const invalid = validateEmail(email);
    setError(invalid);
    if (invalid) return;
    await forgotPassword(email);
    onSent();
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.bg0 }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text
          style={[scaleText(typography.modalTitle, scale), { color: theme.text }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('auth.forgotPassword')}
        </Text>

        {formError ? <ErrorBanner message={t(formError)} /> : null}

        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setError(null);
            clearErrors();
          }}
          error={error ? t(error) : undefined}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          onSubmitEditing={() => void submit()}
          returnKeyType="send"
          testID="forgot-email"
        />

        <Button
          label={t('common.send')}
          onPress={() => void submit()}
          loading={busy}
          testID="forgot-submit"
        />
        <LinkButton label={t('auth.backToSignIn')} onPress={onBack} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' },
});
