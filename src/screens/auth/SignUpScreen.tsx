import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button, Checkbox, ErrorBanner, Field, LinkButton } from '../../design/components';
import { MAX_FONT_SIZE_MULTIPLIER, scaleText, status, typography } from '../../design/tokens';
import { useAuthStore } from '../../features/auth/authStore';
import { hasErrors, validateSignUp, type FormErrors, type SignUpForm } from '../../features/auth/validation';
import { LegalConsentText } from '../../features/legal/LegalConsentText';
import { LegalDocumentModal } from '../../features/legal/LegalDocumentModal';
import { privacyPolicyFor } from '../../features/legal/privacyPolicy';
import { useSettingsStore } from '../../store/settings';
import { useFontScale, useTheme } from '../../store/settings';

/**
 * Регистрация (§8.2): имя, почта, пароль и согласие с документами. После
 * отправки — экран ввода 6-значного кода из письма.
 *
 * Имя спрашивается ровно один раз и больше не переспрашивается (§8.2).
 *
 * ПОЧЕМУ СОГЛАСИЕ ЗДЕСЬ, ХОТЯ ОНО ЕСТЬ И В ОНБОРДИНГЕ. Дисклеймер (§8.1)
 * показывается по acceptedDocsVersion, а это значение хранится НА УСТРОЙСТВЕ,
 * а не на аккаунте (RootNavigator, needsConsent). Значит второй и последующие
 * аккаунты на том же телефоне — после выхода или регистрации на чужого
 * человека — создаются без единого показа документов. Требование App Store
 * 5.1.1 и Google User Data привязано к созданию аккаунта, а не к установке,
 * поэтому галочка стоит там, где аккаунт и создаётся.
 *
 * Условия использования НЕ ОТКРЫВАЮТСЯ: их текста у нас нет, а отдельной
 * веб-страницы условий не существует — вести человека на пустую страницу хуже,
 * чем не вести никуда. Политика открывается своим окном с вшитым текстом: оно
 * работает без сети (§10, privacyPolicy.ts). Ссылку на условия из конфига
 * убрали за ненадобностью; если текст появится, документ откроется тем же
 * встроенным окном, а не внешним браузером, иначе человек потеряет
 * заполненную форму.
 */
export default function SignUpScreen({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();
  const language = useSettingsStore((s) => s.language);

  const signUp = useAuthStore((s) => s.signUp);
  const busy = useAuthStore((s) => s.busy);
  const serverErrors = useAuthStore((s) => s.fieldErrors);
  const formError = useAuthStore((s) => s.formError);
  const clearErrors = useAuthStore((s) => s.clearErrors);

  const [form, setForm] = useState<SignUpForm>({ fullname: '', email: '', password: '' });
  const [localErrors, setLocalErrors] = useState<FormErrors<SignUpForm>>({});
  const [secure, setSecure] = useState(true);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [policyVisible, setPolicyVisible] = useState(false);

  const patch = (key: keyof SignUpForm) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setLocalErrors((prev) => ({ ...prev, [key]: undefined }));
    clearErrors();
  };

  const submit = () => {
    const errors = validateSignUp(form);
    setLocalErrors(errors);

    // Обе проверки считаются ДО выхода: иначе человек чинит поля, жмёт ещё
    // раз и только тогда узнаёт про галочку. Показываем всё разом.
    const missingConsent = !consent;
    setConsentError(missingConsent);

    if (hasErrors(errors) || missingConsent) return;

    // lang уходит на сервер: тексты писем локализуются на бэкенде по полю
    // lang пользователя (§9).
    void signUp({ ...form, lang: language });
  };

  const errorFor = (key: keyof SignUpForm) => {
    const messageKey = localErrors[key] ?? serverErrors[key];
    return messageKey ? t(messageKey) : undefined;
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
          {t('auth.signUp')}
        </Text>

        {formError ? <ErrorBanner message={t(formError)} /> : null}

        <Field
          label={t('auth.fullname')}
          value={form.fullname}
          onChangeText={patch('fullname')}
          error={errorFor('fullname')}
          autoComplete="name"
          textContentType="name"
          testID="signup-fullname"
        />

        <Field
          label={t('auth.email')}
          value={form.email}
          onChangeText={patch('email')}
          error={errorFor('email')}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          testID="signup-email"
        />

        <Field
          label={t('auth.password')}
          value={form.password}
          onChangeText={patch('password')}
          error={errorFor('password')}
          secureTextEntry={secure}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          onToggleSecure={() => setSecure((v) => !v)}
          toggleSecureLabel={secure ? t('auth.showPassword') : t('auth.hidePassword')}
          onSubmitEditing={submit}
          returnKeyType="go"
          testID="signup-password"
        />

        {/*
          Подпись берётся из onboarding.consent — «Ман бо … розӣ ҳастам».
          Ключ auth.legalConsent рядом с галочкой не годится: он сформулирован
          как пассивная строка под формой («Бо идома додан…»), а у галочки
          подпись обязана быть утверждением от первого лица — человек ставит
          её сам. Строка та же самая на обоих экранах, поэтому и ключ один.
        */}
        <Checkbox
          checked={consent}
          error={consentError}
          testID="signup-consent"
          onToggle={() => {
            setConsent((v) => !v);
            setConsentError(false);
          }}
        >
          <LegalConsentText
            textKey="onboarding.consent"
            onPressLink={(name) => {
              if (name === 'privacy') setPolicyVisible(true);
            }}
          />
        </Checkbox>

        {consentError ? (
          <Text
            style={[scaleText(typography.caption, scale), { color: status.error.text }]}
            maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
          >
            {t('authErrors.consentRequired')}
          </Text>
        ) : null}

        {/*
          Кнопка НЕ заблокирована без галочки — то же решение, что на экране
          дисклеймера: заблокированная кнопка на нажатие не отвечает ничем, и
          человек не узнаёт, чего от него хотят. Здесь нажатие всегда даёт
          ответ — либо отправку, либо подсвеченную галочку со строкой ошибки.
        */}
        <Button label={t('auth.signUp')} onPress={submit} loading={busy} testID="signup-submit" />
        <LinkButton label={t('auth.signIn')} onPress={onSignIn} />
      </ScrollView>

      <LegalDocumentModal
        visible={policyVisible}
        document={privacyPolicyFor(language)}
        onClose={() => setPolicyVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' },
});
