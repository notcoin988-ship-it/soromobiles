import { createMMKV } from 'react-native-mmkv';

/**
 * Лёгкое хранилище настроек (§4.2: react-native-mmkv для настроек и лёгкого кэша).
 *
 * §11, без исключений: токены здесь НЕ хранятся. MMKV — обычный файл в
 * песочнице приложения, доступный любому, кто до неё добрался; для токенов
 * есть Keychain / Android Keystore (features/auth/tokenStore.ts).
 *
 * Тексты диалогов сюда тоже не попадают — они в SQLite (src/db).
 */

// В MMKV 4 экземпляр создаётся фабрикой (nitro-модуль), а не конструктором:
// `new MMKV()` из примеров версии 2 здесь не работает.
export const settingsStorage = createMMKV({ id: 'soro-settings' });

export const SETTINGS_KEY = 'settings.v1';

/** Первый запуск: выбран ли язык и с какой редакцией документов согласились (§8.1). */
export const ONBOARDING_KEY = 'onboarding.v1';
