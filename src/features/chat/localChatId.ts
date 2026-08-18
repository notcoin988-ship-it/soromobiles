/**
 * Локальный идентификатор чата (§5.5).
 *
 * Проблема, которую он решает: chat_id выдаёт сервер (POST /v1/chat/new), а
 * без сети его взять неоткуда. Без локального id первое же сообщение,
 * написанное в самолёте, показать можно, но поставить в очередь — нельзя:
 * outbox.chat_id обязателен. Такое сообщение молча пропадало бы, а §17
 * требует, чтобы оно ушло при восстановлении связи.
 *
 * Поэтому чат заводится локально, а при первом же выходе в сеть очередь
 * создаёт настоящий чат и подменяет id (db.promoteChat).
 *
 * Префикс с двоеточием выбран намеренно: серверные id — UUID, двоеточия в них
 * не бывает, поэтому спутать нельзя. Ни один локальный id на сервер не уходит.
 */

export const LOCAL_CHAT_PREFIX = 'local:';

export function isLocalChatId(chatId: string): boolean {
  return chatId.startsWith(LOCAL_CHAT_PREFIX);
}

export function newLocalChatId(uuid: string): string {
  return `${LOCAL_CHAT_PREFIX}${uuid}`;
}
