// Именно из languages.ts, а не из ../i18n: тот тянет react-i18next, которого
// в node-тестах нет.
import { LANGUAGES, type Language } from '../i18n/languages';
import type { SettingsState, ThemePreference } from './settingsTypes';

/**
 * Разбор сохранённых настроек (§4.2, персист в MMKV).
 *
 * Вынесено отдельным файлом без нативных импортов — MMKV в node не поднять, а
 * ошибки живут именно здесь. Главное требование: НИ ОДНО значение из хранилища
 * не должно уронить запуск. Там может оказаться что угодно — обрывок записи,
 * настройка от прошлой версии приложения, отредактированный вручную файл.
 * Поэтому каждое поле проверяется отдельно, а негодное молча заменяется
 * значением по умолчанию: сброс одной настройки лучше белого экрана.
 */

const THEME_PREFERENCES: readonly ThemePreference[] = ['dark', 'light', 'system'];
export function serializeSettings(state: SettingsState): string {
  return JSON.stringify({
    themePreference: state.themePreference,
    language: state.language,
  });
}

export function parseSettings(raw: string | undefined | null, defaults: SettingsState): SettingsState {
  if (!raw) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }

  if (typeof parsed !== 'object' || parsed === null) return defaults;
  const data = parsed as Record<string, unknown>;

  return {
    themePreference: pick(data.themePreference, THEME_PREFERENCES, defaults.themePreference),
    language: pick(data.language, LANGUAGES as readonly Language[], defaults.language),
  };
}

function pick<T>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
