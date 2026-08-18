import { open, type DB } from '@op-engineering/op-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

import { getDatabaseKey } from './encryptionKey';

/**
 * Движок локальной базы: op-sqlite со сборкой SQLCipher (§11 — «Локальная БД
 * зашифрована (SQLCipher), ключ — в Keychain/Keystore»).
 *
 * ПОЧЕМУ НЕ expo-sqlite. Он шифрования не поддерживает вовсе, и это был
 * единственный незакрытый пункт §11: тексты диалогов школьников лежали на
 * диске открытым текстом. §4.2 допускает оба варианта — «op-sqlite или
 * expo-sqlite с SQLCipher», — но второго варианта в природе нет.
 *
 * АДАПТЕР, А НЕ ПЕРЕПИСЫВАНИЕ. Наружу отдаются те же четыре операции, что
 * были у expo-sqlite, поэтому db/index.ts и весь код над ним не изменились.
 * Замена движка — не повод трогать работающие запросы.
 *
 * ИМЯ ФАЙЛА ДРУГОЕ. Старая база soro.db не зашифрована, и открыть её с ключом
 * нельзя: SQLCipher не отличит «неверный ключ» от «незашифрованный файл».
 * Переносить содержимое через sqlcipher_export можно, но смысла нет: история
 * подтягивается с сервера при первом же выходе в сеть, а незашифрованный
 * файл нужно именно УДАЛИТЬ, а не оставить рядом.
 */

export const DATABASE_NAME = 'soro-secure.db';
const LEGACY_DATABASE_NAME = 'soro.db';

export type QueryRow = Record<string, unknown>;

export type Database = {
  /** Запрос без результата: DDL, INSERT, UPDATE, DELETE. */
  run(sql: string, params?: unknown[]): Promise<void>;
  /** Все строки. */
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Первая строка или null. */
  first<T>(sql: string, params?: unknown[]): Promise<T | null>;
  /** Пачка операций одной транзакцией. */
  transaction(fn: (tx: Pick<Database, 'run'>) => Promise<void>): Promise<void>;
};

let instance: DB | null = null;

function wrap(raw: DB): Database {
  return {
    async run(sql, params) {
      await raw.execute(sql, params as never);
    },
    async all<T>(sql: string, params?: unknown[]) {
      const result = await raw.execute(sql, params as never);
      return (result.rows ?? []) as T[];
    },
    async first<T>(sql: string, params?: unknown[]) {
      const result = await raw.execute(sql, params as never);
      return ((result.rows ?? [])[0] as T) ?? null;
    },
    async transaction(fn) {
      await raw.transaction(async (tx) => {
        await fn({
          run: async (sql, params) => {
            await tx.execute(sql, params as never);
          },
        });
      });
    },
  };
}

export async function openEncrypted(): Promise<Database> {
  if (instance) return wrap(instance);

  const encryptionKey = await getDatabaseKey();
  instance = open({ name: DATABASE_NAME, encryptionKey });

  return wrap(instance);
}

/**
 * Удаление незашифрованной базы прошлых версий.
 *
 * Файл удаляется НАПРЯМУЮ, а не через open().delete(). Первая версия делала
 * именно так и промахнулась мимо цели: expo-sqlite держал базу в
 * <documents>/SQLite/, а op-sqlite открывает файлы в databases/, и вызов
 * создавал пустую базу в другом каталоге вместо удаления старой. Проверка на
 * устройстве показала, что soro.db так и лежит рядом с заголовком
 * «SQLite format 3» открытым текстом — то есть §11 был выполнен наполовину.
 *
 * Удаляются все три файла: сама база и журналы -wal и -shm. В журнале WAL
 * лежат последние записанные страницы — то есть свежие сообщения, — и без
 * него удаление основного файла оставило бы часть переписки на диске.
 */
export async function dropLegacyDatabase(): Promise<void> {
  const directory = `${FileSystem.documentDirectory ?? ''}SQLite/`;

  for (const suffix of ['', '-wal', '-shm']) {
    const path = `${directory}${LEGACY_DATABASE_NAME}${suffix}`;
    try {
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      // Файла нет — обычный случай при чистой установке.
    }
  }
}

/** Закрытие и удаление — для удаления аккаунта (§8.5). */
export async function destroyDatabase(): Promise<void> {
  if (!instance) return;
  try {
    instance.delete();
  } finally {
    instance = null;
  }
}
