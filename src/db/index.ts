import { dropLegacyDatabase, openEncrypted, type Database } from './engine';

import { LIKE_ESCAPE, likePattern, normalizeForSearch } from '../features/history/search';
import {
  COLUMN_MIGRATIONS,
  CREATE_STATEMENTS,
  type ChatRow,
  type MessageRow,
  type OutboxRow,
  type OutboxStatus,
} from './schema';

/**
 * Локальная база (§5.1, §11).
 *
 * База ЗАШИФРОВАНА: op-sqlite со сборкой SQLCipher, ключ лежит в Android
 * Keystore / iOS Keychain (db/engine.ts, db/encryptionKey.ts). Тексты
 * диалогов школьников на диске нечитаемы даже при физическом доступе к
 * разблокированному телефону, а резервные копии выключены отдельно
 * (allowBackup=false), поэтому в облако они тоже не уедут.
 *
 * Работа с движком спрятана за адаптером: здесь те же четыре операции, что
 * были у expo-sqlite, и запросы при переезде не менялись.
 */

let db: Database | null = null;

export async function openDatabase(): Promise<Database> {
  if (db) return db;

  db = await openEncrypted();

  // Незашифрованная база прошлых версий удаляется, а не остаётся рядом:
  // иначе §11 выполнен только наполовину.
  dropLegacyDatabase();

  // Каскадное удаление сообщений вместе с чатом работает только при включённых
  // внешних ключах — в SQLite они выключены по умолчанию.
  await db.run('PRAGMA foreign_keys = ON');
  // WAL: чтение истории не блокируется записью пришедшего ответа.
  await db.run('PRAGMA journal_mode = WAL');

  for (const statement of CREATE_STATEMENTS) {
    await db.run(statement);
  }

  await migrate(db);
  return db;
}

/**
 * Досоздание колонок в базе, созданной прежней версией приложения.
 *
 * CREATE TABLE IF NOT EXISTS на уже существующей таблице молча ничего не
 * делает, а ALTER TABLE ADD COLUMN не поддерживает IF NOT EXISTS — поэтому
 * наличие колонки проверяется через PRAGMA table_info.
 */
async function migrate(database: Database): Promise<void> {
  for (const migration of COLUMN_MIGRATIONS) {
    const columns = await database.all<{ name: string }>(
      `PRAGMA table_info(${migration.table})`,
    );
    if (columns.some((c) => c.name === migration.column)) continue;

    await database.run(migration.ddl);
  }

  // Backfill: регистр приводится в JS, средствами SQLite кириллицу не привести.
  const chats = await database.all<{ id: string; title: string }>(
    `SELECT id, title FROM chats WHERE title_lower = '' AND title <> ''`,
  );
  for (const chat of chats) {
    await database.run(`UPDATE chats SET title_lower = ? WHERE id = ?`, [
      normalizeForSearch(chat.title),
      chat.id,
    ]);
  }

  const messages = await database.all<{ id: string; content: string }>(
    `SELECT id, content FROM messages WHERE content_lower = '' AND content <> ''`,
  );
  for (const message of messages) {
    await database.run(`UPDATE messages SET content_lower = ? WHERE id = ?`, [
      normalizeForSearch(message.content),
      message.id,
    ]);
  }
}

// ---------------------------------------------------------------------------
// Чаты и сообщения
// ---------------------------------------------------------------------------

export async function upsertChat(chat: ChatRow): Promise<void> {
  const database = await openDatabase();
  await database.run(
    `INSERT INTO chats (id, title, title_lower, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       title_lower = excluded.title_lower,
       status = excluded.status,
       updated_at = excluded.updated_at`,
    [
      chat.id,
      chat.title,
      normalizeForSearch(chat.title),
      chat.status,
      chat.created_at,
      chat.updated_at,
    ],
  );
}

/**
 * Поиск по заголовкам и тексту сообщений (§8.4).
 *
 * DISTINCT обязателен: чат, у которого совпали три сообщения, иначе появился
 * бы в списке трижды. Пустой запрос возвращает весь список — это «показать
 * всё», а не «ничего не найдено».
 */
export async function searchChats(query: string): Promise<ChatRow[]> {
  const pattern = likePattern(query);
  if (pattern === null) return listChats();

  const database = await openDatabase();
  return database.all<ChatRow>(
    `SELECT DISTINCT c.id, c.title, c.status, c.created_at, c.updated_at
       FROM chats c
       LEFT JOIN messages m ON m.chat_id = c.id
      WHERE c.status = 'active'
        AND (c.title_lower LIKE ? ESCAPE '${LIKE_ESCAPE}'
             OR m.content_lower LIKE ? ESCAPE '${LIKE_ESCAPE}')
      ORDER BY c.updated_at DESC`,
    [pattern, pattern],
  );
}

/**
 * Поднимает чат наверх списка, не трогая заголовок.
 *
 * Отдельно от upsertChat намеренно: тот перезаписывает title, и вызов его на
 * каждое сообщение переименовывал бы диалог по последнему вопросу.
 */
export async function touchChat(chatId: string, updatedAt: string): Promise<void> {
  const database = await openDatabase();
  await database.run(`UPDATE chats SET updated_at = ? WHERE id = ?`, [updatedAt, chatId]);
}

/**
 * Подмена локального id чата на выданный сервером (§5.5).
 *
 * Прямой UPDATE chats SET id = ? невозможен: внешний ключ messages.chat_id
 * объявлен без ON UPDATE CASCADE, и SQLite такую правку отвергнет. Поэтому
 * порядок именно такой — новая строка, перевод детей, удаление старой, и всё
 * одной транзакцией: оборвись оно посередине, чат остался бы без сообщений.
 */
export async function promoteChat(localId: string, serverId: string): Promise<void> {
  const database = await openDatabase();
  await database.transaction(async () => {
    await database.run(
      `INSERT OR IGNORE INTO chats (id, title, status, created_at, updated_at)
       SELECT ?, title, status, created_at, updated_at FROM chats WHERE id = ?`,
      [serverId, localId],
    );
    await database.run(`UPDATE messages SET chat_id = ? WHERE chat_id = ?`, [
      serverId,
      localId,
    ]);
    await database.run(`UPDATE outbox SET chat_id = ? WHERE chat_id = ?`, [serverId, localId]);
    await database.run(`DELETE FROM chats WHERE id = ?`, [localId]);
  });
}

export async function renameChatLocally(chatId: string, title: string): Promise<void> {
  const database = await openDatabase();
  await database.run(`UPDATE chats SET title = ?, title_lower = ? WHERE id = ?`, [
    title,
    normalizeForSearch(title),
    chatId,
  ]);
}

/** Список чатов для drawer. Удалённые не показываем (B13). */
export async function listChats(): Promise<ChatRow[]> {
  const database = await openDatabase();
  return database.all<ChatRow>(
    `SELECT * FROM chats WHERE status = 'active' ORDER BY updated_at DESC`,
  );
}

export async function upsertMessages(messages: MessageRow[]): Promise<void> {
  if (messages.length === 0) return;
  const database = await openDatabase();

  // Одна транзакция на пачку: 200 отдельных вставок на Redmi 9A заметны.
  await database.transaction(async () => {
    for (const m of messages) {
      await database.run(
        `INSERT INTO messages (id, chat_id, role, content, content_lower, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           content_lower = excluded.content_lower`,
        [m.id, m.chat_id, m.role, m.content, normalizeForSearch(m.content), m.created_at],
      );
    }
  });
}

/** История чата из локальной базы — работает без сети (§10). */
export async function loadMessages(chatId: string): Promise<MessageRow[]> {
  const database = await openDatabase();
  return database.all<MessageRow>(
    `SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`,
    [chatId],
  );
}

export async function deleteChat(chatId: string): Promise<void> {
  const database = await openDatabase();
  await database.run(`DELETE FROM chats WHERE id = ?`, [chatId]);
}

export async function clearAll(): Promise<void> {
  const database = await openDatabase();

  /**
   * По одному оператору на вызов. op-sqlite выполняет РОВНО ОДИН запрос за
   * раз — в отличие от expo-sqlite, который принимал несколько через «;».
   * Прежняя однострочная версия после переезда на SQLCipher удалила бы
   * только очередь, а переписка осталась бы на диске.
   *
   * Одной транзакцией: очистка истории не должна оставлять сообщения без
   * чатов, если её прервать.
   */
  await database.transaction(async (tx) => {
    await tx.run('DELETE FROM outbox');
    await tx.run('DELETE FROM messages');
    await tx.run('DELETE FROM chats');
  });
}

// ---------------------------------------------------------------------------
// Очередь отправки (§5.5)
// ---------------------------------------------------------------------------

export async function enqueue(item: Omit<OutboxRow, 'attempts' | 'status'>): Promise<void> {
  const database = await openDatabase();
  // INSERT OR IGNORE: client_msg_id — первичный ключ, поэтому повторная
  // постановка того же сообщения физически невозможна (§17, «ровно один раз»).
  await database.run(
    `INSERT OR IGNORE INTO outbox (client_msg_id, chat_id, content, class_level, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [item.client_msg_id, item.chat_id, item.content, item.class_level, item.created_at],
  );
}

/** Очередь разбирается последовательно, в порядке created_at (§5.5). */
export async function nextPending(): Promise<OutboxRow | null> {
  const database = await openDatabase();
  const row = await database.first<OutboxRow>(
    `SELECT * FROM outbox WHERE status IN ('pending', 'failed') ORDER BY created_at ASC LIMIT 1`,
  );
  return row ?? null;
}

export async function markOutbox(
  clientMsgId: string,
  status: OutboxStatus,
  incrementAttempt = false,
): Promise<void> {
  const database = await openDatabase();
  await database.run(
    incrementAttempt
      ? `UPDATE outbox SET status = ?, attempts = attempts + 1 WHERE client_msg_id = ?`
      : `UPDATE outbox SET status = ? WHERE client_msg_id = ?`,
    [status, clientMsgId],
  );
}

export async function removeFromOutbox(clientMsgId: string): Promise<void> {
  const database = await openDatabase();
  await database.run(`DELETE FROM outbox WHERE client_msg_id = ?`, [clientMsgId]);
}

/** Неотправленное конкретного чата — показывается в ленте с пометкой «Дар навбат». */
export async function pendingForChat(chatId: string): Promise<OutboxRow[]> {
  const database = await openDatabase();
  return database.all<OutboxRow>(
    `SELECT * FROM outbox WHERE chat_id = ? ORDER BY created_at ASC`,
    [chatId],
  );
}

export async function pendingCount(): Promise<number> {
  const database = await openDatabase();
  const row = await database.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM outbox WHERE status IN ('pending', 'failed')`,
  );
  return row?.n ?? 0;
}
