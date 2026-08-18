import * as SecureStore from 'expo-secure-store';

import type { AuthTokens, TokenStore } from '../../api/client';

/**
 * Хранение токенов (§11).
 *
 * Токены НИКОГДА не попадают в MMKV/AsyncStorage — только в iOS Keychain и
 * Android Keystore.
 *
 * ОТКЛОНЕНИЕ ОТ §4.2: используется expo-secure-store, а не
 * react-native-keychain. Это его прямой эквивалент в экосистеме Expo — та же
 * пара Keychain/Keystore под капотом и та же политика доступности
 * AFTER_FIRST_UNLOCK, которую требует §11 (kSecAttrAccessibleAfterFirstUnlock).
 * Выигрыш: не нужен отдельный config-плагин и лишний нативный модуль.
 *
 * AFTER_FIRST_UNLOCK выбран сознательно: приложение должно доживать фоновые
 * обновления и не терять сессию, но данные остаются недоступны, пока телефон
 * ни разу не разблокировали после перезагрузки.
 */

const ACCESS_KEY = 'soro.access_token';
const REFRESH_KEY = 'soro.refresh_token';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

async function readItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, OPTIONS);
  } catch {
    // Хранилище может быть недоступно (устройство не разблокировано,
    // повреждённая запись). Это не повод падать — считаем, что токена нет,
    // и уводим на экран входа.
    return null;
  }
}

export const secureTokenStore: TokenStore = {
  async getAccess() {
    return readItem(ACCESS_KEY);
  },

  async getRefresh() {
    return readItem(REFRESH_KEY);
  },

  async save(tokens: AuthTokens) {
    // Порядок важен: refresh пишем первым. Если процесс умрёт между записями,
    // лучше остаться с валидным refresh и протухшим access (это чинится
    // рефрешем), чем наоборот — с access без возможности его продлить.
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh_token, OPTIONS);
    await SecureStore.setItemAsync(ACCESS_KEY, tokens.access_token, OPTIONS);
  },

  async clear() {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY, OPTIONS).catch(() => {}),
      SecureStore.deleteItemAsync(REFRESH_KEY, OPTIONS).catch(() => {}),
    ]);
  },
};

/** Есть ли сохранённая сессия — проверяется на старте до показа экранов. */
export async function hasStoredSession(): Promise<boolean> {
  return (await readItem(REFRESH_KEY)) !== null;
}
