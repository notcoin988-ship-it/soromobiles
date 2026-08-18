import { create } from 'zustand';

import { api } from '../../api';
import { askStream, regenerate as regenerateAnswer } from '../../api/endpoints/ask';
import { createChat, getChat, renameChat, titleFromQuestion } from '../../api/endpoints/chats';
import type { ApiError } from '../../api/errors';
import { isConnected } from '../../api/network';
import type { AskMessage } from '../../api/types';
import * as db from '../../db';
import { track } from '../../telemetry/events';
import type { MessageRow } from '../../db/schema';
import { queryClient, queryKeys } from '../../api/queryClient';
import { isLocalChatId, newLocalChatId } from './localChatId';
import { chatErrorKey } from './errorMessages';
import { drainOutbox, enqueueMessage } from './outbox';
import { TokenBuffer } from './tokenBuffer';

/**
 * Состояние чата (§8.3).
 *
 * Ключевое требование §5.4: стрим живёт в сервисном слое, а НЕ в компоненте.
 * Поэтому генерация здесь, в сторе: она переживает сворачивание приложения,
 * поворот экрана и входящий звонок, а UI при возврате просто подхватывает
 * накопленный текст.
 */

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Ответ ещё генерируется — под ним не показываем кнопки действий. */
  streaming?: boolean;
  /** Сообщение ждёт сети (§5.5, §8.7). */
  queued?: boolean;
};

export type LimitInfo = {
  message: string;
  resetsInHours: number | null;
  resetsAtLocal: string | null;
};

export type ChatState = {
  chatId: string | null;
  messages: ChatMessage[];
  /** Идёт генерация — кнопка отправки превращается в «Стоп» (§8.3). */
  generating: boolean;
  /** Плашка исчерпанного лимита остаётся в переписке (§8.6). */
  limit: LimitInfo | null;
  /** i18n-ключ ошибки уровня ленты. */
  errorKey: string | null;
};

export type ChatActions = {
  send: (question: string) => Promise<void>;
  /** Перегенерация ответа (§8.3): существующая строка перезаписывается. */
  regenerate: (messageId: string) => Promise<void>;
  /** Открыть чат: история читается из SQLite, поэтому работает без сети (§10). */
  openChat: (chatId: string) => Promise<void>;
  /** Перечитать текущий чат из SQLite — после разбора очереди (§5.5). */
  refreshFromDb: (chatId?: string) => Promise<void>;
  /** Локальный id чата заменён выданным сервером (§5.5). */
  adoptChatId: (serverId: string, localId: string) => void;
  stop: () => void;
  reset: () => void;
  /** Тозакунии таърих (§8.5): чистит и экран, и локальную базу. */
  clearHistory: () => Promise<void>;
  dismissError: () => void;
};

/** Контекст для сервера: последние 4 пары + новый вопрос (§6.3.3). */
function toAskHistory(messages: ChatMessage[]): AskMessage[] {
  return messages
    .filter((m) => !m.queued && m.content.length > 0)
    .map((m) => ({ role: m.role, content: m.content }));
}

/** Строки SQLite → лента. Очередь подмешивается отдельно (см. openChat). */
function toChatMessages(rows: readonly MessageRow[]): ChatMessage[] {
  return rows.map((row) => ({ id: row.id, role: row.role, content: row.content }));
}

/**
 * Показать ленту чата из локальной базы: сохранённые сообщения плюс то, что
 * ещё стоит в очереди отправки.
 */
async function renderFromDb(
  chatId: string,
  set: (partial: Partial<ChatState>) => void,
): Promise<void> {
  const rows = await db.loadMessages(chatId);
  const queued = await db.pendingForChat(chatId);

  set({
    messages: [
      ...toChatMessages(rows),
      // Неотправленное показывается в конце ленты с пометкой «Дар навбат».
      ...queued.map((item) => ({
        id: item.client_msg_id,
        role: 'user' as const,
        content: item.content,
        queued: true,
      })),
    ],
  });
}

/**
 * Догрузка переписки с сервера (§6.3.2, `GET /v1/chat/{id}`).
 *
 * Четыре причины ничего не делать — все проверяются до запроса или до записи:
 *
 * 1. чат ещё не существует на сервере (`local:` id, §5.5) — спрашивать нечего;
 * 2. сети нет: локальная история и так показана, а §10 запрещает пустой экран
 *    из-за отсутствия связи;
 * 3. пока запрос летел, человек открыл другой чат — ответ уже не к месту, и
 *    записать его в состояние значило бы подменить ленту под пальцами;
 * 4. сервер отказал (чужой чат — 403, удалённый — 404, сеть отвалилась). Тогда
 *    остаётся показанный кэш: сервер не смог подтвердить историю, но это не
 *    повод стирать то, что человек уже видит.
 *
 * Успех пишется в SQLite, а лента перечитывается ОТТУДА — источник истины для
 * истории один (§5.2), и расходиться «показанному» с «сохранённым» негде.
 */
async function syncMessagesFromServer(
  chatId: string,
  get: () => ChatState & ChatActions,
  set: (partial: Partial<ChatState>) => void,
): Promise<void> {
  if (isLocalChatId(chatId) || !isConnected()) return;

  const result = await getChat(api, chatId);
  if (!result.ok) return;
  if (get().chatId !== chatId) return;

  // Генерация уже началась в этом же чате — свежий ответ на экране новее
  // серверного снимка, и перерисовка ленты оборвала бы его на полуслове.
  if (get().generating) return;

  try {
    await db.upsertMessages(
      result.data.messages.map((message) => ({
        id: message.id,
        chat_id: chatId,
        role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: message.content,
        created_at: message.created_at,
      })),
    );
  } catch {
    // Не записалось — на экране остаётся то, что пришло с сервера в кэше
    // Query; следующее открытие попробует снова.
    return;
  }

  if (get().chatId !== chatId || get().generating) return;
  await renderFromDb(chatId, set);
}

/**
 * Сохранение переписки локально (§5.2: SQLite — источник истины для истории).
 *
 * Ошибку записи глушим намеренно: неудача с локальной базой не должна ронять
 * уже показанный на экране ответ. Потеря кэша означает лишь то, что история
 * подтянется с сервера при следующем открытии.
 */
async function persistExchange(
  chatId: string,
  user: ChatMessage,
  assistant: ChatMessage,
): Promise<void> {
  const now = Date.now();
  try {
    await db.upsertMessages([
      {
        id: user.id,
        chat_id: chatId,
        role: 'user',
        content: user.content,
        created_at: new Date(now).toISOString(),
      },
      {
        id: assistant.id,
        chat_id: chatId,
        role: 'assistant',
        content: assistant.content,
        // +1 мс: сортировка идёт по created_at, и при одинаковом значении
        // порядок вопроса и ответа стал бы неопределённым.
        created_at: new Date(now + 1).toISOString(),
      },
    ]);
  } catch {
    // См. комментарий выше.
  }
}

let abortController: AbortController | null = null;

export const useChatStore = create<ChatState & ChatActions>()((set, get) => ({
  chatId: null,
  messages: [],
  generating: false,
  limit: null,
  errorKey: null,

  dismissError: () => set({ errorKey: null }),

  reset: () => {
    abortController?.abort();
    abortController = null;
    set({ chatId: null, messages: [], generating: false, limit: null, errorKey: null });
  },

  async clearHistory() {
    get().reset();
    // Экран без базы — половина работы: тексты диалогов остались бы на диске.
    await db.clearAll();
    // Список в drawer читает ту же базу и сам об очистке не узнает.
    void queryClient.invalidateQueries({ queryKey: queryKeys.chats });
  },

  /**
   * Открытие чата (§10, критерий §17 «история открывается без сети»).
   *
   * Сначала SQLite — экран заполняется мгновенно и работает в самолёте.
   * Сеть только догоняет кэш; при её отсутствии показанное остаётся как есть.
   */
  async openChat(chatId) {
    abortController?.abort();
    abortController = null;
    set({ chatId, generating: false, limit: null, errorKey: null });

    await renderFromDb(chatId, set);

    /**
     * Кэш показан — теперь догоняем сервер (§10: «сначала кэш, сеть следом»).
     *
     * Без этого переписка существовала ТОЛЬКО на том устройстве, где её вели:
     * список чатов приходил с сервера, а сообщения не приходили ниоткуда, и
     * чат с другого телефона (или после переустановки, или после выхода из
     * аккаунта) открывался пустым. §17 требует обратного — история должна
     * читаться, а не только храниться.
     */
    await syncMessagesFromServer(chatId, get, set);
  },

  /**
   * Очередь создала настоящий чат вместо локального (§5.5). Подменяем id
   * синхронно: следующий вопрос обязан уйти уже с серверным.
   */
  adoptChatId: (serverId, localId) => {
    if (get().chatId !== localId) return;
    set({ chatId: serverId });
  },

  async refreshFromDb(chatId) {
    const id = chatId ?? get().chatId;
    // Во время генерации не трогаем ленту: перезапись затрёт растущий ответ.
    if (!id || id !== get().chatId || get().generating) return;
    await get().openChat(id);
  },

  stop: () => {
    // Кнопка «Стоп» отменяет стрим и ОСТАВЛЯЕТ уже полученный текст (§5.4).
    abortController?.abort();
    abortController = null;
    set((s) => ({
      generating: false,
      messages: s.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    }));
  },

  async regenerate(messageId) {
    const { chatId, messages, generating } = get();
    if (!chatId || generating) return;

    const index = messages.findIndex((m) => m.id === messageId);
    if (index < 1) return;

    // messages — контекст ДО и включая пользовательский вопрос, на который
    // отвечаем; новое пользовательское сообщение не создаётся (§6.3.3).
    const question = messages[index - 1];
    if (question.role !== 'user') return;

    set({ generating: true, errorKey: null });
    const result = await regenerateAnswer(api, {
      chatId,
      question: question.content,
      history: toAskHistory(messages.slice(0, index - 1)),
      messageId,
    });

    if (result.ok) {
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === messageId ? { ...m, content: result.data.response } : m,
        ),
      }));
    } else {
      set({ errorKey: errorKeyOf(result.error) });
    }
    set({ generating: false });
  },

  async send(question) {
    const trimmed = question.trim();
    if (!trimmed || get().generating) return;

    set({ errorKey: null });

    // B8: идентификатор создаётся ДО отправки и переживает обрыв связи.
    // Тот же самый уйдёт при повторе из очереди, и сервер не создаст дубликат.
    const clientMsgId = cryptoRandomId();

    /**
     * §13: первое сообщение считается отдельно. Разрыв между «зарегистрировался»
     * и «задал первый вопрос» — главная метрика продукта: человек, дошедший до
     * чата и не спросивший ничего, потерян.
     */
    track({ name: get().chatId === null ? 'first_message_sent' : 'message_sent' });

    /**
     * Офлайн (§5.5, §8.7). Сообщение уходит в очередь и показывается в ленте
     * с пометкой «Дар навбат».
     *
     * Если чата ещё нет, заводим локальный: chat_id выдаёт сервер, но ждать
     * сети нельзя — иначе первое же сообщение, написанное без интернета,
     * пропало бы вместо того, чтобы уйти при восстановлении связи (§17).
     * Настоящий id очередь получит сама и подменит локальный.
     */
    if (!isConnected()) {
      let chatId = get().chatId;
      if (!chatId) {
        chatId = newLocalChatId(cryptoRandomId());
        const createdAt = new Date().toISOString();
        await db.upsertChat({
          id: chatId,
          title: titleFromQuestion(trimmed),
          status: 'active',
          created_at: createdAt,
          updated_at: createdAt,
        });
        set({ chatId });
      }

      await enqueueMessage({
        clientMsgId,
        chatId,
        content: trimmed,
        classLevel: null,
      });

      set((s) => ({
        messages: [
          ...s.messages,
          { id: clientMsgId, role: 'user', content: trimmed, queued: true },
        ],
        errorKey: 'errors.offline',
      }));
      return;
    }

    /**
     * Сеть вернулась, а в очереди ещё лежат вопросы (§5.5). Они обязаны уйти
     * раньше нового: иначе в переписке ответ на старый вопрос встанет после
     * нового, а при локальном chat_id новый вопрос ушёл бы с несуществующим
     * идентификатором.
     */
    if ((await db.pendingCount()) > 0) await drainOutbox();

    // Порядок создания чата (§8.3): если активного чата нет, сначала создаём
    // его, и только потом отправляем вопрос.
    let chatId = get().chatId;

    /**
     * Очередь не сумела превратить локальный чат в серверный — например, связь
     * снова пропала посреди разбора. Отправлять вопрос с несуществующим на
     * сервере chat_id нельзя (404), поэтому он тоже уходит в очередь.
     */
    if (chatId && isLocalChatId(chatId)) {
      await enqueueMessage({ clientMsgId, chatId, content: trimmed, classLevel: null });
      set((s) => ({
        messages: [...s.messages, { id: clientMsgId, role: 'user', content: trimmed, queued: true }],
      }));
      return;
    }
    let isFirstMessage = false;
    if (!chatId) {
      const created = await createChat(api);
      if (!created.ok) {
        set({ errorKey: errorKeyOf(created.error) });
        return;
      }
      chatId = created.data.chat_id;
      isFirstMessage = true;
      set({ chatId });

      // Строка чата нужна до сообщений: messages.chat_id — внешний ключ с
      // ON DELETE CASCADE, и вставка сообщения без чата будет отвергнута.
      const createdAt = new Date().toISOString();
      await db.upsertChat({
        id: chatId,
        title: titleFromQuestion(trimmed),
        status: 'active',
        created_at: createdAt,
        updated_at: createdAt,
      });
    }

    // B10: заголовок, сформированный сервером. Если он придёт — обходной путь
    // через PATCH /rename не понадобится.
    let serverTitle: string | null = null;

    const history = toAskHistory(get().messages);
    // id пользовательского сообщения = client_msg_id: тот же ключ и в очереди,
    // и в SQLite, поэтому повторная доставка перезапишет строку, а не добавит.
    const userMessage: ChatMessage = { id: clientMsgId, role: 'user', content: trimmed };
    const assistantId = `assistant-${Date.now()}`;
    // Сервер присваивает ответу свой message_id — под ним и сохраняем локально.
    let finalAssistantId = assistantId;

    set((s) => ({
      messages: [
        ...s.messages,
        userMessage,
        { id: assistantId, role: 'assistant', content: '', streaming: true },
      ],
      generating: true,
    }));

    // Токены копятся и применяются к состоянию батчами раз в ~50 мс (§5.4):
    // на каждый токен setState кладёт интерфейс на дешёвом Android.
    const buffer = new TokenBuffer({
      onFlush: (fullText) => {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantId ? { ...m, content: fullText } : m,
          ),
        }));
      },
    });

    abortController = new AbortController();

    const outcome = await askStream(
      api,
      {
        chatId,
        question: trimmed,
        history,
        classLevel: null,
        // B8: тот же идентификатор, что и в очереди — сервер отсечёт дубликат.
        clientMsgId,
      },
      {
        onEvent: (event) => {
          switch (event.type) {
            case 'token':
              buffer.push(event.text);
              break;
            case 'corrected':
              // B9: fact-check прислал исправленный полный текст.
              buffer.close();
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantId ? { ...m, content: event.response } : m,
                ),
              }));
              break;
            case 'done':
              buffer.flush();
              finalAssistantId = event.messageId ?? finalAssistantId;
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantId ? { ...m, id: event.messageId ?? m.id, streaming: false } : m,
                ),
              }));
              break;
            case 'error':
              // Сервер уже записал в историю своё извинение — не дублируем
              // собственным текстом (§6.4).
              buffer.flush();
              set({ errorKey: 'errors.genericError' });
              break;
            default:
              break;
          }
        },
        onFallback: (fallback) => {
          // Бесшовный переход на /v2/ask при 409 — пользователю не сообщаем (§5.4).
          if (fallback.kind === 'answer') {
            buffer.close();
            serverTitle = fallback.data.chat_title ?? null;
            finalAssistantId = fallback.data.message_id;
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      id: fallback.data.message_id,
                      content: fallback.data.response,
                      streaming: false,
                    }
                  : m,
              ),
            }));
          }
          // kind === 'inProgress' (B8): тот же вопрос уже обрабатывается.
          // Повторно ничего не шлём — ответ придёт при следующем открытии чата.
        },
      },
      abortController.signal,
    );

    buffer.close();
    abortController = null;

    if (outcome.kind === 'failed') {
      const error = outcome.error;
      if (error.kind === 'limit') {
        set({
          limit: {
            message: error.message,
            resetsInHours: error.resetsInHours,
            resetsAtLocal: error.resetsAtLocal,
          },
        });
      } else {
        set({ errorKey: errorKeyOf(error) });
      }
      // Пустой пузырь ассистента убираем — показывать нечего.
      set((s) => ({
        messages: s.messages.filter((m) => !(m.id === assistantId && m.content === '')),
      }));
    }

    set({ generating: false });

    /**
     * Кэш истории (§5.2, §10). Пишем и при остановке кнопкой «Стоп», и после
     * обрыва посреди стрима: полученный кусок ответа остаётся в переписке, и
     * при следующем открытии чата без сети он должен быть виден.
     */
    const answer = get().messages.find((m) => m.id === finalAssistantId);
    if (chatId && answer && answer.content.length > 0) {
      await persistExchange(chatId, userMessage, answer);
      // Список чатов сортируется по updated_at DESC (§6.3.2): без этого
      // активный диалог не поднимется наверх drawer.
      await db.touchChat(chatId, new Date().toISOString());
      // B10: сервер прислал свой заголовок — он точнее обрезанного вопроса.
      if (serverTitle) await db.renameChatLocally(chatId, serverTitle);

      /**
       * Список в drawer читает ту же базу, но сам об изменении не узнает
       * (§8.4): без этого новый чат не появится в списке до перезапуска.
       *
       * Инвалидация напрямую через queryClient, а не через хук: стор — не
       * компонент React, хуков здесь нет. Ровно для этого клиент и вынесен
       * в модуль (§4.2).
       */
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats });
    }

    /**
     * B10 — заголовок чата.
     *
     * §6.6: сервер сам формирует заголовок после первого обмена и возвращает
     * его в AssistantResponse как chat_title. «До реализации клиент вызывает
     * PATCH /rename с первыми 30 символами первого вопроса».
     *
     * Поэтому переименование — фолбэк, а не основной путь: как только бэкенд
     * начнёт присылать chat_title, лишний запрос исчезнет сам.
     */
    if (isFirstMessage && chatId && serverTitle === null) {
      void renameChat(api, chatId, titleFromQuestion(trimmed));
    }
  },
}));

function errorKeyOf(error: ApiError): string {
  /**
   * §13: error_shown с ВИДОМ ошибки. Считаем ровно там, где ошибка реально
   * попадает на экран, а не там, где она возникла: половина ошибок гасится
   * ретраями и пользователь их не видит.
   */
  track({ name: 'error_shown', kind: error.kind });

  // Сам разбор — чистой функцией рядом: он нужен под тестами, а стор в
  // node-окружении не поднять, он тянет нативные модули.
  return chatErrorKey(error.kind);
}

/** UUID v4 без внешних зависимостей — для client_msg_id (B8). */
function cryptoRandomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}