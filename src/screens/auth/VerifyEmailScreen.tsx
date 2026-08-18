import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, ErrorBanner, Field, LinkButton } from '../../design/components';
import { MAX_FONT_SIZE_MULTIPLIER, scaleText, typography } from '../../design/tokens';
import { useAuthStore } from '../../features/auth/authStore';
import {
  VERIFICATION_CODE_LENGTH,
  resendSecondsLeft,
  validateCode,
} from '../../features/auth/validation';
import { useFontScale, useTheme } from '../../store/settings';

/**
 * Подтверждение почты 6-значным кодом (§8.2).
 *
 * После подтверждения человек попадает СРАЗУ в чат, а не обратно на экран
 * входа — это отдельное требование §8.2, и оно выполняется тем, что стор
 * переводит статус в signedIn, а навигация реагирует на статус.
 */
export default function VerifyEmailScreen({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();

  const verify = useAuthStore((s) => s.verify);
  const resend = useAuthStore((s) => s.resend);
  const busy = useAuthStore((s) => s.busy);
  const email = useAuthStore((s) => s.pendingEmail);
  const serverErrors = useAuthStore((s) => s.fieldErrors);
  const formError = useAuthStore((s) => s.formError);
  const lastCodeSentAt = useAuthStore((s) => s.lastCodeSentAt);
  const clearErrors = useAuthStore((s) => s.clearErrors);

  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    resendSecondsLeft(lastCodeSentAt, Date.now()),
  );

  // Обратный отсчёт таймера повторной отправки (§8.2).
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft(resendSecondsLeft(lastCodeSentAt, Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [lastCodeSentAt]);

  const onChange = (value: string) => {
    // Оставляем только цифры: вставка из письма часто тащит пробелы и дефисы.
    const digits = value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH);
    setCode(digits);
    setLocalError(null);
    clearErrors();

    // Автоотправка при полном коде — экономит тап на медленной связи.
    if (digits.length === VERIFICATION_CODE_LENGTH) void verify(digits);
  };

  const submit = () => {
    const error = validateCode(code);
    setLocalError(error);
    if (error) return;
    void verify(code);
  };

  const errorKey = localError ?? serverErrors.code;

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
          {t('auth.verifyTitle')}
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
          onChangeText={onChange}
          error={errorKey ? t(errorKey) : undefined}
          keyboardType="number-pad"
          maxLength={VERIFICATION_CODE_LENGTH}
          // Автозаполнение кода из письма/СМС (§8.2).
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          testID="verify-code"
        />

        <Button
          label={t('auth.verifySubmit')}
          onPress={submit}
          loading={busy}
          testID="verify-submit"
        />

        <Text
          style={[scaleText(typography.caption, scale), { color: theme.text3 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('auth.checkSpam')}
        </Text>

        {secondsLeft > 0 ? (
          <Text
            style={[scaleText(typography.caption, scale), { color: theme.text3 }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {t('auth.resendIn', { sec: secondsLeft })}
          </Text>
        ) : (
          <LinkButton label={t('auth.resend')} onPress={() => void resend()} />
        )}

        <LinkButton label={t('auth.backToSignIn')} onPress={onBack} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' },
});
