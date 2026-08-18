import { useColorScheme } from 'react-native';
import { create } from 'zustand';

import { fontScale, themes, type Theme } from '../design/tokens';
import { DEFAULT_LANGUAGE, changeLanguage, type Language } from '../i18n';
import { SETTINGS_KEY, settingsStorage } from './kv';
import { parseSettings, serializeSettings } from './settingsCodec';
import type {
  SettingsState,
  ThemeName,
  ThemePreference,
} from './settingsTypes';

/**
 * Настройки приложения: тема и язык (§8.5).
 * Стек — Zustand + MMKV, как предписывает §4.2.
 *
 * Сохранённое читается СИНХРОННО при импорте модуля, до первого рендера:
 * асинхронное чтение дало бы вспышку тёмной темы тому, кто выбрал светлую,
 * и кадр интерфейса на чужом языке.
 */

export type { SettingsState, ThemeName, ThemePreference };

export type SettingsActions = {
  setThemePreference: (value: ThemePreference) => void;
  setLanguage: (value: Language) => void;
};

export const DEFAULT_SETTINGS: SettingsState = {
  // Тёмная — тема по умолчанию (§7).
  themePreference: 'dark',
  // Таджикский, НЕЗАВИСИМО от языка системы (§9).
  language: DEFAULT_LANGUAGE,
};

/**
 * Загрузка при старте. Ошибку чтения глушим: испорченное хранилище не должно
 * мешать запуску — приложение просто откроется с настройками по умолчанию.
 */
function loadSettings(): SettingsState {
  try {
    return parseSettings(settingsStorage.getString(SETTINGS_KEY), DEFAULT_SETTINGS);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(state: SettingsState): void {
  try {
    settingsStorage.set(SETTINGS_KEY, serializeSettings(state));
  } catch {
    // Не сохранилось — настройка действует до перезапуска. Ронять приложение
    // из-за этого нельзя.
  }
}

export const useSettingsStore = create<SettingsState & SettingsActions>()((set, get) => {
  const persist = () => saveSettings(get());

  return {
    ...loadSettings(),

    setThemePreference: (themePreference) => {
      set({ themePreference });
      persist();
    },

    /**
     * Смена языка. Кроме самого i18next перезапрашивает конфигурацию: тексты
     * карточек-подсказок приходят с сервера на конкретном языке (§7.5), и без
     * принудительного запроса они остались бы на прежнем до истечения
     * суточного кэша (§6.6).
     *
     * Импорт внутри функции, а не сверху файла: config.ts уже импортирует
     * settings.ts ради текущего языка, и статический импорт замкнул бы цикл.
     */
    setLanguage: (language) => {
      // i18next переключается здесь же: интерфейс обязан перерисоваться без
      // перезапуска приложения (§9).
      changeLanguage(language);
      set({ language });
      persist();

      void import('./config').then(({ useConfigStore }) => {
        // force = true: суточный кэш здесь мешает, язык сменился прямо сейчас.
        void useConfigStore.getState().load(true);
      });
    },

  };
});

/**
 * Разрешённое имя темы: 'system' разворачивается в dark/light по системной
 * настройке. useColorScheme — React-хук, поэтому живёт здесь, а не в сторе.
 */
export function useThemeName(): ThemeName {
  const preference = useSettingsStore((s) => s.themePreference);
  const systemScheme = useColorScheme();

  if (preference !== 'system') return preference;
  // Тёмная остаётся значением по умолчанию, если система не сообщила схему.
  return systemScheme === 'light' ? 'light' : 'dark';
}

/** Токены текущей темы — самый частый случай в компонентах. */
export function useTheme(): Theme {
  return themes[useThemeName()];
}

/**
 * Множитель размера шрифта для scaleText().
 *
 * Всегда 1.0: выбор из четырёх ступеней (§8.5) убран из настроек по решению
 * заказчика. Функция оставлена намеренно — её зовут десятки компонентов, и
 * вырезать вызовы значило бы тронуть каждый экран ради нуля пользы.
 *
 * Доступность при этом не теряется: системный крупный шрифт Android
 * продолжает действовать через maxFontSizeMultiplier (потолок 1.6, §7.2).
 */
export function useFontScale(): number {
  return fontScale.normal;
}
