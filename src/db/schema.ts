/**
 * Схема локальной базы (§5.1, §5.5).
 *
 * db/ — единственный источник истины для истории (§5.2): экран истории читает
 * из SQLite, а не из сети; сеть только обновляет SQLite. Это то, что позволяет
 * открывать переписку без интернета (§10, критерий §17).
 *
 * Схема вынесена отдельным файлом без импортов, чтобы её можно было проверять
 * тестами, не поднимая нативный expo-sqlite.
 */

export const SCHEMA_VERSION = 2;

/**
 * Таблицы. WITHOUT ROWID не используем: id — UUID-строки, и обычный rowid
 * даёт более предсказуемый план на маленьких таблицах.
 */
export const CREATE_STATEMENTS: readonly string[] = [
  /**
   * title_lower — заголовок в нижнем регистре для поиска (§8.4).
   *
   * Отдельная колонка, а не LOWER(title) в запросе: и LIKE, и функция lower()
   * в SQLite приводят регистр только для ASCII, поэтому «Салом» и «салом» для
   * них разные строки. Регистр приводится в JS при записи (см. search.ts).
   */
  `CREATE TABLE IF NOT EXISTS chats (
     id          TEXT PRIMARY KEY NOT NULL,
     title       TEXT NOT NULL,
     title_lower TEXT NOT NULL DEFAULT '',
     status      TEXT NOT NULL DEFAULT 'active',
     created_at  TEXT NOT NULL,
     updated_at  TEXT NOT NULL
   )`,

  // Сортировка списка чатов — updated_at DESC (§6.3.2).
  `CREATE INDEX IF NOT EXISTS idx_chats_updated ON chats (updated_at DESC)`,

  // content_lower — то же самое для текста сообщений: §8.4 требует искать и
  // по нему, а не только по заголовкам.
  `CREATE TABLE IF NOT EXISTS messages (
     id            TEXT PRIMARY KEY NOT NULL,
     chat_id       TEXT NOT NULL,
     role          TEXT NOT NULL,
     content       TEXT NOT NULL,
     content_lower TEXT NOT NULL DEFAULT '',
     created_at    TEXT NOT NULL,
     FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
   )`,

  `CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages (chat_id, created_at)`,

  /**
   * Очередь отправки (§5.5). Поля — ровно как в таблице ТЗ.
   *
   * client_msg_id — PRIMARY KEY, и это не косметика: повторная постановка того
   * же сообщения в очередь физически невозможна. Вместе с B8 на сервере это
   * даёт критерий §17 «уходит ровно один раз».
   */
  `CREATE TABLE IF NOT EXISTS outbox (
     client_msg_id TEXT PRIMARY KEY NOT NULL,
     chat_id       TEXT NOT NULL,
     content       TEXT NOT NULL,
     class_level   TEXT,
     created_at    INTEGER NOT NULL,
     attempts      INTEGER NOT NULL DEFAULT 0,
     status        TEXT NOT NULL DEFAULT 'pending'
   )`,

  // Очередь разбирается последовательно в порядке created_at (§5.5).
  `CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox (status, created_at)`,
];

/**
 * Миграции для баз, созданных прежней версией приложения.
 *
 * CREATE TABLE IF NOT EXISTS на существующей таблице ничего не добавит, а
 * ALTER TABLE ADD COLUMN в SQLite не умеет IF NOT EXISTS — поэтому наличие
 * колонки проверяется через PRAGMA table_info (см. db/index.ts). Значения
 * досчитываются в JS: приводить регистр кириллицы средствами SQLite нельзя.
 */
export const COLUMN_MIGRATIONS: readonly { table: string; column: string; ddl: string }[] = [
  { table: 'chats', column: 'title_lower', ddl: `ALTER TABLE chats ADD COLUMN title_lower TEXT NOT NULL DEFAULT ''` },
  {
    table: 'messages',
    column: 'content_lower',
    ddl: `ALTER TABLE messages ADD COLUMN content_lower TEXT NOT NULL DEFAULT ''`,
  },
];

export type OutboxStatus = 'pending' | 'sending' | 'sent' | 'failed';

export type OutboxRow = {
  client_msg_id: string;
  chat_id: string;
  content: string;
  class_level: string | null;
  created_at: number;
  attempts: number;
  status: OutboxStatus;
};

export type ChatRow = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type MessageRow = {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

/**
 * Служебные колонки поиска в типах строк не объявлены намеренно: за их
 * заполнение отвечает db/index.ts, а остальному коду они не нужны.
 */
