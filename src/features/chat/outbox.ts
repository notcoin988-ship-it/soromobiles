import { api } from '../../api';
import { isConnected } from '../../api/network';
import { ask } from '../../api/endpoints/ask';
import { createChat } from '../../api/endpoints/chats';
import * as db from '../../db';
import { isLocalChatId } from './localChatId';
import { decideOutbox } from './outboxPolicy';

/**
 * Очередь отправки (§5.5, §10).
 *
 * Требование §17: «Сообщение, отправленное без сети, уходит при восстановлении
 * связи ровно один раз (без дублей)». Это обеспечивается тремя вещами вместе:
 *
 *   1. client_msg_id — PRIMARY KEY таблицы outbox, повторно поставить в
 *      очередь то же сообщение физически нельзя;
 *   2. тот же client_msg_id уходит на сервер, и B8 гарантирует, что повторный
 *      запрос вернёт готовый ответ вместо новой генерации;
 *   3. очередь разбирается ПОСЛЕДОВАТЕЛЬНО — параллельная отправка сломала бы
 *      порядок сообщений в чате.
 *
 * Пункт 2 на бэкенде пока не сделан. До него повтор при обрыве создаст
 * дубликат в БД — это ограничение отмечено в README.
 */

let running = false;

/**
 * Слушатели «очередь изменилась». Через них открытый экран чата перечитывает
 * SQLite и снимает с сообщения пометку «Дар навбат» — без прямой зависимости
 * очереди от стора (иначе получится цикл импортов).
 */
export type OutboxListener = (chatId: string, replacedLocalId?: string) => void;

const listeners = new Set<OutboxListener>();

export function onOutboxDelivered(listener: OutboxListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(chatId: string, replacedLocalId?: string): void {
  for (const listener of listeners) listener(chatId, replacedLocalId);
}

/** Ставит сообщение в очередь. Возвращает false, если такое уже стоит. */
export async function enqueueMessage(params: {
  clientMsgId: string;
  chatId: string;
  content: string;
  classLevel: string | null;
}): Promise<void> {
  await db.enqueue({
    client_msg_id: params.clientMsgId,
    chat_id: params.chatId,
    content: params.content,
    class_level: params.classLevel,
    created_at: Date.now(),
  });
}

export type DrainResult = { sent: number; failed: number; skipped: boolean };

/**
 * Разбирает очередь. Идемпотентна: повторный вызов во время работы ничего не
 * делает — иначе слушатель сети и таймер запустили бы две параллельные
 * обработки и переставили сообщения местами.
 */
export async function drainOutbox(): Promise<DrainResult> {
  if (running) return { sent: 0, failed: 0, skipped: true };
  if (!isConnected()) return { sent: 0, failed: 0, skipped: true };

  running = true;
  let sent = 0;
  let failed = 0;

  try {
    for (;;) {
      const item = await db.nextPending();
      if (!item) break;

      // Сеть могла пропасть посреди разбора очереди.
      if (!isConnected()) break;

      await db.markOutbox(item.client_msg_id, 'sending', true);

      /**
       * Чат мог быть заведён без сети и иметь локальный id (localChatId.ts).
       * Сервер такого не знает — создаём настоящий чат и подменяем id во всех
       * таблицах, прежде чем отправлять вопрос.
       */
      let chatId = item.chat_id;
      if (isLocalChatId(chatId)) {
        const created = await createChat(api);
        if (!created.ok) {
          // Не удалось создать чат — сообщение остаётся в очереди целиком.
          await db.markOutbox(item.client_msg_id, 'pending');
          break;
        }
        await db.promoteChat(chatId, created.data.chat_id);
        const localId = chatId;
        chatId = created.data.chat_id;
        // Открытый экран должен узнать новый id, иначе следующий вопрос уйдёт
        // с локальным и сервер ответит 404.
        notify(chatId, localId);
      }

      const result = await ask(api, {
        chatId,
        question: item.content,
        classLevel: (item.class_level as never) ?? null,
        // Тот же идентификатор, что и при первой попытке — в этом весь смысл.
        clientMsgId: item.client_msg_id,
      });

      // Что делать с этим сообщением — решает чистая функция из outboxPolicy,
      // она же покрыта тестами (§17, «ровно один раз»).
      const action = decideOutbox(result, item.attempts);

      if (result.kind === 'answer' && action.type === 'delivered') {
        /**
         * Пишем обе строки в SQLite ДО удаления из очереди. Порядок важен:
         * если приложение убьют между этими двумя операциями, сообщение
         * останется в очереди и уйдёт повторно — но с тем же client_msg_id,
         * и B8 вернёт готовый ответ вместо второй генерации. Обратный порядок
         * потерял бы ответ навсегда.
         *
         * created_at берём временем постановки в очередь, а не временем
         * доставки: иначе сообщение, пролежавшее ночь без сети, встанет в
         * ленте после более поздних.
         */
        const createdAt = new Date(item.created_at).toISOString();
        await db.upsertMessages([
          {
            id: item.client_msg_id,
            chat_id: chatId,
            role: 'user',
            content: item.content,
            created_at: createdAt,
          },
          {
            id: result.data.message_id,
            chat_id: chatId,
            role: 'assistant',
            content: result.data.response,
            created_at: new Date().toISOString(),
          },
        ]);

        await db.removeFromOutbox(item.client_msg_id);
        notify(chatId);
        sent += 1;
        continue;
      }

      /**
       * B8: сервер ответил 202 — тот же client_msg_id уже обрабатывается.
       * Это НЕ ошибка и не повод слать заново: сообщение дошло, ответ
       * генерируется. Убираем из очереди, иначе будем долбить сервер
       * повторами одного и того же вопроса.
       */
      if (result.kind === 'inProgress') {
        // Вопрос на сервере есть — сохраняем его локально, чтобы он перестал
        // висеть с пометкой «Дар навбат». Ответ подтянется при следующем
        // открытии чата с сервера.
        await db.upsertMessages([
          {
            id: item.client_msg_id,
            chat_id: chatId,
            role: 'user',
            content: item.content,
            created_at: new Date(item.created_at).toISOString(),
          },
        ]);
        await db.removeFromOutbox(item.client_msg_id);
        notify(chatId);
        sent += 1;
        continue;
      }

      if (action.type === 'giveUp') {
        // failed остаётся в очереди: пользователь увидит его и решит сам.
        await db.markOutbox(item.client_msg_id, 'failed');
        failed += 1;
        break;
      }

      // postpone и retry: возвращаем в pending и выходим. Дальше по очереди не
      // идём — сообщения одного чата обязаны сохранять порядок (§5.5).
      await db.markOutbox(item.client_msg_id, 'pending');
      break;
    }
  } finally {
    running = false;
  }

  return { sent, failed, skipped: false };
}

export function isDraining(): boolean {
  return running;
}
