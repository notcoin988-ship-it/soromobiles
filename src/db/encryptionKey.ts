import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

/**
 * Ключ шифрования локальной базы (§11: «Локальная БД зашифрована (SQLCipher),
 * ключ — в Keychain/Keystore»).
 *
 * ПОЧЕМУ КЛЮЧ ГЕНЕРИРУЕТСЯ, А НЕ ЗАШИТ. Зашитый в бинарник ключ не защищает
 * ни от чего: он одинаков у всех установок и достаётся из APK командой
 * strings — тем самым способом, которым §17 проверяет отсутствие секретов.
 * Случайный ключ на устройство означает, что скопированный файл базы без
 * этого устройства не открыть.
 *
 * ХРАНИЛИЩЕ. SecureStore кладёт значение в Android Keystore и iOS Keychain —
 * это ровно то, что требует §11. Флаг AFTER_FIRST_UNLOCK нужен, чтобы база
 * открывалась после перезагрузки без разблокировки экрана: иначе очередь
 * отправки не сможет проснуться в фоне.
 */

const KEY_NAME = 'soro.db.key';

const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
};

/** 256 бит — размер ключа SQLCipher по умолчанию. */
const KEY_BYTES = 32;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Возвращает ключ, создавая его при первом запуске.
 *
 * Ключ шестнадцатеричный: SQLCipher принимает строку как парольную фразу и
 * прогоняет её через KDF, а hex-представление гарантирует, что в ней не
 * окажется кавычек и прочих символов, ломающих PRAGMA key.
 */
export async function getDatabaseKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME, OPTIONS);
  if (existing) return existing;

  const key = toHex(await Crypto.getRandomBytesAsync(KEY_BYTES));
  await SecureStore.setItemAsync(KEY_NAME, key, OPTIONS);
  return key;
}

/**
 * Удаление ключа. Вызывается вместе с очисткой базы при удалении аккаунта:
 * без ключа остатки файла нечитаемы, даже если файл кто-то восстановит.
 */
export async function dropDatabaseKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME, OPTIONS).catch(() => {});
}
