import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorBanner, Field, LinkButton } from '../../design/components';
import { MAX_FONT_SIZE_MULTIPLIER, scaleText, typography } from '../../design/tokens';
import { useAuthStore } from '../../features/auth/authStore';
import {
  VERIFICATION_CODE_LENGTH,
  validateCode,
  validatePassword,
} from '../../features/auth/validation';
import { useFontScale, useTheme } from '../../store/settings';

/**
 * Восстановление пароля, шаг 2 (§8.2): код из письма → новый пароль → сразу
 * в чат. Обратно на экран входа не возвращаем — это отдельное требование §8.2.
 */
export default function ResetPasswordScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();

  const resetPassword = useAuthStore((s) => s.resetPassword);
  const busy = useAuthStore((s) => s.busy);
  const email = useAuthStore((s) => s.pendingEmail);
  const serverErrors = useAuthStore((s) => s.fieldErrors);
  const formError = useAuthStore((s) => s.formError);
  const clearErrors = useAuthStore((s) => s.clearErrors);

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [errors, setErrors] = useState<{ code?: string | null; password?: string | null }>({});

  const submit = () => {
    const next = {
      code: validateCode(code),
      password: validatePassword(password),
    };
    setErrors(next);
    if (next.code || next.password) return;
    void resetPassword({ code, newPassword: password });
  };

  const codeError = errors.code ?? serverErrors.code;
  const passwordError = errors.password ?? serverErrors.password;

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
          {t('auth.resetPassword')}
        </Text>

        <Text
          style={[scaleText(typography.subgreeting, scale), { color: theme.text2 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('auth.verifyHint', { email: email ?? '' })}
        </Text>

        {formError ? <ErrorBanner message={t(formError)} /> : null}

        <Field
          label={t('auth.verifySubmit')}
          value={code}
          onChangeText={(value) => {
            setCode(value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH));
            setErrors((p) => ({ ...p, code: null }));
            clearErrors();
          }}
          error={codeError ? t(codeError) : undefined}
          keyboardType="number-pad"
          maxLength={VERIFICATION_CODE_LENGTH}
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          testID="reset-code"
        />

        <Field
          label={t('auth.newPassword')}
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setErrors((p) => ({ ...p, password: null }));
            clearErrors();
          }}
          error={passwordError ? t(passwordError) : undefined}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          onToggleSecure={() => setSecure((v) => !v)}
          toggleSecureLabel={secure ? t('auth.showPassword') : t('auth.hidePassword')}
          onSubmitEditing={submit}
          returnKeyType="go"
          testID="reset-password"
        />

        <Button
          label={t('auth.resetPassword')}
          onPress={submit}
          loading={busy}
          testID="reset-submit"
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
