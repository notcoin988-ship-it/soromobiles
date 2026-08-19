import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ErrorBanner, GoogleButton } from '../../design/components';
import { CrystalField } from '../../design/CrystalField';
import { Logo } from '../../design/Logo';
import { MAX_FONT_SIZE_MULTIPLIER, scaleText, typography } from '../../design/tokens';
import { useAuthStore } from '../../features/auth/authStore';
import { LegalConsentText } from '../../features/legal/LegalConsentText';
import { LegalDocumentModal } from '../../features/legal/LegalDocumentModal';
import { privacyPolicyFor } from '../../features/legal/privacyPolicy';
import { useSettingsStore, useFontScale, useTheme, useThemeName } from '../../store/settings';

/**
 * Единственный экран входа (§8.2 в редакции после перехода на Google).
 *
 * Одна кнопка — «Идома бо Google», как на sorollm.tj. Полей почты и пароля
 * нет, регистрации отдельным экраном нет: аккаунт заводится сам при первом
 * входе, имя и почту отдаёт Google.
 *
 * ПОЧЕМУ СОГЛАСИЕ ЗДЕСЬ ПАССИВНОЙ СТРОКОЙ, А НЕ ГАЛОЧКОЙ. Галочка стояла на
 * экране регистрации, потому что дисклеймер онбординга запоминается НА
 * УСТРОЙСТВЕ (acceptedDocsVersion, RootNavigator), и второй аккаунт на том же
 * телефоне создавался бы без единого показа документов, а App Store 5.1.1 и
 * Google User Data привязаны к созданию аккаунта. Требование — раскрыть
 * документы в момент создания аккаунта; активного подтверждения ни один из
 * магазинов не требует. Вход в одно касание с обязательной галочкой перед ним
 * превращается в два, поэтому здесь строка со ссылками прямо над кнопкой:
 * документы раскрыты там же, где заводится аккаунт, и открываются тапом.
 *
 * Политика открывается своим окном с вшитым текстом — оно работает без сети
 * (§10, privacyPolicy.ts). Условия использования не открываются: их текста у
 * нас нет, а вести человека на пустую страницу хуже, чем не вести никуда.
 */
export default function SignInScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const themeName = useThemeName();
  const scale = useFontScale();
  const language = useSettingsStore((s) => s.language);

  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const busy = useAuthStore((s) => s.busy);
  const formError = useAuthStore((s) => s.formError);

  const [policyVisible, setPolicyVisible] = useState(false);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg0 }]}>
      {/* Фон: кристаллы дрейфуют под содержимым, касания сквозь них проходят. */}
      <CrystalField />

      <ScrollView contentContainerStyle={styles.content}>
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

        {/*
          Документы — НАД кнопкой, а не под ней: под кнопкой их не читают, а
          раскрыть их надо до создания аккаунта, а не после.
        */}
        <LegalConsentText
          textKey="auth.legalConsent"
          onPressLink={(name) => {
            if (name === 'privacy') setPolicyVisible(true);
          }}
        />

        <GoogleButton
          label={t('auth.continueWithGoogle')}
          onPress={() => void signInWithGoogle(themeName)}
          loading={busy}
          testID="signin-google"
        />
      </ScrollView>

      <LegalDocumentModal
        visible={policyVisible}
        document={privacyPolicyFor(language)}
        onClose={() => setPolicyVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' },
  logo: { alignSelf: 'center' },
});
