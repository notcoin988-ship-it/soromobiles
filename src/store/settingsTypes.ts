import type { Language } from '../i18n/languages';

/**
 * Типы настроек (§8.5) — отдельным файлом без импортов react-native.
 *
 * settings.ts тянет useColorScheme и design/tokens, а те — react-native.
 * Разбор сохранённого значения (settingsCodec.ts) должен проверяться тестами
 * в node, поэтому общие типы вынесены сюда.
 */

export type ThemeName = 'dark' | 'light';
export type ThemePreference = ThemeName | 'system';

export type SettingsState = {
  themePreference: ThemePreference;
  language: Language;
};
