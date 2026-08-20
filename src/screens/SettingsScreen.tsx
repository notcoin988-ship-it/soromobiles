import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { api } from '../api';
import { deleteAccount } from '../api/endpoints/auth';
import { destroyDatabase } from '../db/engine';
import { dropDatabaseKey } from '../db/encryptionKey';
import { useLinks } from '../store/config';
import { APP_VERSION, BUILD_NUMBER } from '../telemetry/appVersion';
import { Button, ErrorBanner } from '../design/components';
import {
  MAX_FONT_SIZE_MULTIPLIER,
  radius,
  ruby,
  scaleText,
  status as statusTokens,
  typography,
} from '../design/tokens';
import { useAuthStore } from '../features/auth/authStore';
import { useChatStore } from '../features/chat/chatStore';
import { LegalDocumentModal } from '../features/legal/LegalDocumentModal';
import { privacyPolicyFor } from '../features/legal/privacyPolicy';
import { LANGUAGES, type Language } from '../i18n';
import {
  useFontScale,
  useSettingsStore,
  useTheme,
  type ThemePreference,
} from '../store/settings';

/**
 * Настройки и профиль (§8.5).
 *
 * Удаление аккаунта обязано быть доступно не более чем в 3 тапа от главного
 * экрана — Apple проверяет это отдельно (Guideline 5.1.1(v)), Google требует
 * того же. Здесь путь: чат → настройки → удалить → подтвердить. Это два тапа
 * до экрана и один на действие.
 */

const THEMES: ThemePreference[] = ['dark', 'light', 'system'];

export default function SettingsScreen({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const scale = useFontScale();
  const insets = useSafeAreaInsets();

  const settings = useSettingsStore();
  const links = useLinks();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  // Чистит и ленту, и SQLite: с локальной историей одного reset уже мало (§8.5).
  const clearHistory = useChatStore((s) => s.clearHistory);

  const [policyVisible, setPolicyVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDeleteAccount = async () => {
    setBusy(true);
    setDeleteError(null);
    const result = await deleteAccount(api);
    setBusy(false);

    if (result.ok) {
      /**
       * Полный логаут и очистка локального состояния (§8.5).
       *
       * Именно clearHistory, а не reset: после удаления аккаунта переписка не
       * должна оставаться на устройстве. Плюс уничтожаем сам файл базы и
       * ключ шифрования из Keystore — иначе восстановленный из бэкапа файл
       * теоретически можно было бы открыть тем же ключом (§11).
       */
      await clearHistory();
      await destroyDatabase();
      await dropDatabaseKey();
      await signOut();
      return;
    }
    /**
     * Подтверждать удаление паролем больше нечем: у аккаунта Google его нет.
     * Истёкшую сессию отдельным текстом не разбираем — 401 клиент уже
     * обработал сам, попыткой рефреша и логаутом при её провале (§5.3).
     */
    setDeleteError('errors.genericError');
  };

  return (
    <>
    <ScrollView
      style={{ backgroundColor: theme.bg0 }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
    >
      <Row label={t('common.cancel')} onPress={onClose} accent />

      {/* --- Забон --- */}
      <Section title={t('settings.language')}>
        {LANGUAGES.map((code) => (
          <Choice
            key={code}
            label={languageLabel(code)}
            selected={settings.language === code}
            onPress={() => settings.setLanguage(code)}
          />
        ))}
      </Section>

      {/* --- Мавзӯъ --- */}
      <Section title={t('settings.theme')}>
        {THEMES.map((value) => (
          <Choice
            key={value}
            label={t(
              value === 'dark'
                ? 'settings.themeDark'
                : value === 'light'
                  ? 'settings.themeLight'
                  : 'settings.themeSystem',
            )}
            selected={settings.themePreference === value}
            onPress={() => settings.setThemePreference(value)}
          />
        ))}
      </Section>

      {/* --- Ҳисоб --- */}
      <Section title={t('settings.account')}>
        <Text
          style={[scaleText(typography.cardText, scale), { color: theme.text2 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {user?.email ?? ''}
        </Text>
        <Text
          style={[scaleText(typography.caption, scale), { color: theme.text3 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {user?.tier ?? ''}
        </Text>
        <Button
          label={t('auth.logout')}
          variant="ghost"
          onPress={() => {
            // Телефон часто общий: после выхода чужая переписка на экране
            // остаться не должна. Локальная база чистится вместе с сессией.
            void clearHistory().finally(() => void signOut());
          }}
        />
      </Section>

      {/*
        Ҳуҷҷатҳо. Ссылки приходят с сервера (B6): если страница переедет,
        зашитая в билд ссылка чинилась бы только новым релизом и днями ревью,
        а всё это время в опубликованном приложении висела бы битая ссылка на
        политику конфиденциальности — основание для снятия с публикации.
      */}
      <Section title={t('settings.privacy')}>
        {/*
          Политика — тем же окном с вшитым текстом, что и при регистрации:
          человек, открывший её из настроек, не должен получить другой ответ,
          чем при создании аккаунта, и без сети она обязана открыться (§10).
        */}
        <Row label={t('settings.privacy')} onPress={() => setPolicyVisible(true)} />

        {/*
          Поддержка ведёт в чат Telegram, и открывается она через Linking, а НЕ
          через встроенный браузер.

          Это намеренное исключение из правила §8.1 «ссылки открываются во
          встроенном браузере». Правило про документы: их читают и
          возвращаются. Здесь же нужен разговор с человеком, и Linking даёт
          системе передать ссылку самому Telegram — открывается приложение с
          готовым диалогом. Встроенный браузер вместо этого показал бы
          веб-страницу t.me с кнопкой «открыть в приложении», то есть лишний
          шаг на ровном месте. Если Telegram не установлен, система откроет
          ту же страницу в браузере — поведение не ломается.
        */}
        {links.support ? (
          <Row
            label={t('settings.help')}
            onPress={() => void Linking.openURL(links.support)}
          />
        ) : null}
      </Section>

      {/* --- Нест кардани ҳисоб --- */}
      <Section title={t('auth.deleteAccount')}>
        <Text
          style={[scaleText(typography.caption, scale), { color: theme.text3 }]}
          maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
        >
          {t('settings.deleteAccountWarning')}
        </Text>

        {deleting ? (
          <>
            {/*
              Второй экран подтверждения вместо поля пароля: у входа через
              Google пароля нет, а необратимое действие не должно случаться от
              одного случайного тапа по чужому разблокированному телефону.
            */}
            <Text
              style={[scaleText(typography.caption, scale), { color: theme.text }]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
              testID="delete-confirm-question"
            >
              {t('settings.confirmDeleteAccount')}
            </Text>
            {deleteError ? <ErrorBanner message={t(deleteError)} /> : null}
            <Button
              label={t('auth.deleteAccount')}
              onPress={() => void confirmDeleteAccount()}
              loading={busy}
              testID="delete-confirm"
            />
            <Button label={t('common.cancel')} variant="ghost" onPress={() => setDeleting(false)} />
          </>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setDeleting(true)}
            style={[styles.danger, { borderColor: statusTokens.error.border }]}
            testID="delete-account"
          >
            <Text
              style={[scaleText(typography.newChatButton, scale), { color: statusTokens.danger }]}
              maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
            >
              {t('auth.deleteAccount')}
            </Text>
          </Pressable>
        )}
      </Section>

      {/* --- Дар бораи барнома: версия нужна, чтобы пользователь мог её назвать (§13) --- */}
      <Text
        style={[scaleText(typography.caption, scale), styles.version, { color: theme.text3 }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {t('settings.version', { version: APP_VERSION, build: BUILD_NUMBER })}
      </Text>
    </ScrollView>

    <LegalDocumentModal
      visible={policyVisible}
      document={privacyPolicyFor(settings.language)}
      onClose={() => setPolicyVisible(false)}
    />
    </>
  );
}

function languageLabel(code: Language): string {
  // Названия языков всегда на самих языках — это не переводимые строки.
  return code === 'tg' ? 'Тоҷикӣ' : code === 'ru' ? 'Русский' : 'English';
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  const scale = useFontScale();
  return (
    <View style={styles.section}>
      <Text
        style={[scaleText(typography.cardCategory, scale), { color: ruby.r300 }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {title}
      </Text>
      <View style={[styles.card, { backgroundColor: theme.bg2, borderColor: theme.border }]}>
        {children}
      </View>
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const scale = useFontScale();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.row, selected ? { backgroundColor: theme.bg3 } : null]}
    >
      <Text
        style={[scaleText(typography.cardText, scale), { color: selected ? ruby.r400 : theme.text }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Row({
  label,
  onPress,
  accent,
}: {
  label: string;
  onPress: () => void;
  accent?: boolean;
}) {
  const theme = useTheme();
  const scale = useFontScale();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <Text
        style={[scaleText(typography.cardText, scale), { color: accent ? ruby.r400 : theme.text }]}
        maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 60, gap: 20 },
  section: { gap: 8 },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 8, gap: 4 },
  row: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: radius.row, minHeight: 44 },
  danger: { borderWidth: 1, borderRadius: radius.button, padding: 14, alignItems: 'center' },
  version: { textAlign: 'center' },
});
