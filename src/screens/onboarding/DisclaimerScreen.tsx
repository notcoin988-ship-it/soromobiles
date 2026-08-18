import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Checkbox } from '../../design/components';
import { Logo } from '../../design/Logo';
import {
  MAX_FONT_SIZE_MULTIPLIER,
  scaleText,
  size,
  status,
  typography,
} from '../../design/tokens';
import { LegalConsentText } from '../../features/legal/LegalConsentText';
import { LegalDocumentModal } from '../../features/legal/LegalDocumentModal';
import { privacyPolicyFor } from '../../features/legal/privacyPolicy';
import { useFontScale, useSettingsStore, useTheme } from '../../store/settings';

/**
 * Второй экран первого запуска (§8.1): дисклеймер и согласие с документами.
 *
 * «Soro метавонад хато кунад» — то же предупреждение, что стоит под композером
 * в чате, но здесь оно показывается один раз и требует явного согласия.
 *
 * Кнопка «Идома» НЕАКТИВНА, пока галочка не поставлена, и это единственный
 * выход с экрана: пропустить согласие нельзя, кнопки «назад» тут нет. §3.1 и
 * оба магазина требуют, чтобы документы были приняты до создания аккаунта.
 *
 * Политика открывается тем же окном с вшитым текстом, что и при регистрации —
 * оно работает без сети (§10). Условия использования пока не открываются: их
 * текста у нас нет, см. комментарий в SignUpScreen.
 */
export default function DisclaimerScreen({ onAccept }: { onAccept: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();
  const insets = useSafeAreaInsets();
  const language = useSettingsStore((s) => s.language);

  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [policyVisible, setPolicyVisible] = useState(false);

  const submit = () => {
    if (!consent) {
      setConsentError(true);
      return;
    }
    onAccept();
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg0, paddingTop: insets.top + 24 }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Logo width={size.logo} />

        <Text
          style={[scaleText(typography.modalTitle, scale), styles.centered, { color: theme.text }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('onboarding.disclaimerTitle')}
        </Text>

        <Text
          style={[
            scaleText(typography.subgreeting, scale),
            styles.centered,
            { color: theme.text2 },
          ]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('onboarding.disclaimerBody')}
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Checkbox
          checked={consent}
          error={consentError}
          testID="onboarding-consent"
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
          Кнопка НЕ заблокирована, хотя без согласия и не сработает.
          Заблокированная кнопка на нажатие не отвечает ничем: человек жмёт,
          ничего не происходит, и почему — не сказано. Здесь нажатие всегда
          даёт ответ: либо переход дальше, либо подсвеченная галочка и строка
          «Барои сабти ном бо шартҳо розӣ шавед». То же поведение, что на
          экране регистрации.
        */}
        <Button
          label={t('onboarding.continue')}
          onPress={submit}
          testID="onboarding-continue"
        />
      </View>

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
  content: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 20,
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
  },
  centered: { textAlign: 'center' },
  footer: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
});
