import type { ApiClient, ApiResult } from '../client';
import { isNotStreamable, type ApiError } from '../errors';
import { SseParser, type SoroStreamEvent } from '../sse';
import type {
  AskMessage,
  AskRequest,
  AssistantResponse,
  ClassLevel,
  ModelAlias,
  RegenerateRequest,
} from '../types';

/**
 * Вопрос к модели (§6.3.3) — самая нагруженная логикой часть клиента.
 *
 * Три вещи, которые здесь нельзя забыть:
 *   1. use_rag передаётся ЯВНЫМ false: на сервере default = true, и пропущенное
 *      поле молча включит веб-поиск через Tavily, который вне объёма v1.0.
 *   2. 409 NOT_STREAMABLE → бесшовный переход на /v2/ask с той же полезной
 *      нагрузкой, БЕЗ сообщения пользователю (§5.4).
 *   3. Сервер сам пишет в БД и вопрос, и ответ — клиент не создаёт сообщения
 *      отдельным вызовом (§6.3.3).
 */

export const MAX_CONTEXT_PAIRS = 4;

/**
 * Последние 4 пары «вопрос-ответ» + новый вопрос, как в вебе
 * (getLastFourQAPairs, §6.3.3). Роли обязаны строго чередоваться user/assistant,
 * иначе сервер отвергает тело.
 */
export function buildContext(history: readonly AskMessage[], question: string): AskMessage[] {
  const pairs: AskMessage[][] = [];
  for (let i = 0; i < history.length; i += 1) {
    const message = history[i];
    if (message.role === 'user') {
      const answer = history[i + 1];
      if (answer?.role === 'assistant') {
        pairs.push([message, answer]);
        i += 1;
      }
    }
  }
  return [...pairs.slice(-MAX_CONTEXT_PAIRS).flat(), { role: 'user', content: question }];
}

export type AskParams = {
  chatId: string;
  question: string;
  history?: readonly AskMessage[];
  model?: ModelAlias;
  classLevel?: ClassLevel | null;
  /** B8: без него повтор при обрыве создаст дубликат в истории. */
  clientMsgId?: string;
};

export function buildAskRequest(params: AskParams): AskRequest {
  return {
    messages: buildContext(params.history ?? [], params.question),
    chat_id: params.chatId,
    temperature: 0.5,
    // Явный false — см. комментарий в начале файла. Не убирать.
    use_rag: false,
    model: params.model ?? 'fast',
    attachment_ids: null,
    class_level: params.classLevel ?? null,
    ...(params.clientMsgId ? { client_msg_id: params.clientMsgId } : {}),
  };
}

/**
 * Ответ на 202 (B8, §6.6): «если генерация ещё идёт — возвращает 202 с
 * request_id, клиент подписывается заново».
 */
export type GenerationInProgress = { request_id: string; status: string };

export type AskOutcome =
  | { kind: 'answer'; data: AssistantResponse }
  /** Тот же вопрос уже обрабатывается — ответа ждать, повторно не слать. */
  | { kind: 'inProgress'; requestId: string }
  | { kind: 'error'; error: ApiError };

/**
 * Блокирующий вопрос. Ретраится только при наличии client_msg_id (§5.3).
 *
 * 202 обрабатывается ОТДЕЛЬНО от 200: оба успешны по HTTP, но означают
 * противоположное. Без этого повтор при обрыве связи показал бы пользователю
 * пустой ответ модели вместо ожидания.
 */
export async function ask(client: ApiClient, params: AskParams): Promise<AskOutcome> {
  const body = buildAskRequest(params);
  const result = await client.request<AssistantResponse | GenerationInProgress>('/v2/ask', {
    method: 'POST',
    body,
    idempotent: Boolean(params.clientMsgId),
  });

  if (!result.ok) return { kind: 'error', error: result.error };

  if (result.status === 202) {
    const pending = result.data as GenerationInProgress;
    return { kind: 'inProgress', requestId: pending.request_id };
  }

  return { kind: 'answer', data: result.data as AssistantResponse };
}

export function regenerate(
  client: ApiClient,
  params: AskParams & { messageId: string },
): Promise<ApiResult<AssistantResponse>> {
  const body: RegenerateRequest = {
    ...buildAskRequest(params),
    message_id: params.messageId,
  };
  return client.request<AssistantResponse>('/v2/ask/regenerate', {
    method: 'POST',
    body,
    idempotent: Boolean(params.clientMsgId),
  });
}

export type StreamHandlers = {
  onEvent: (event: SoroStreamEvent) => void;
  /**
   * Вызывается, когда стрим оказался невозможен и мы бесшовно ушли на /v2/ask.
   * Пользователю об этом сообщать НЕ нужно (§5.4).
   */
  onFallback?: (outcome: AskOutcome) => void;
};

export type StreamOutcome =
  | { kind: 'streamed' }
  | { kind: 'fellBack'; outcome: AskOutcome }
  | { kind: 'failed'; error: ApiError };

/**
 * Стрим ответа (§6.4) с автоматическим фолбэком.
 *
 * Читает тело через ReadableStream: под Expo его даёт expo/fetch, под bare RN —
 * обёртка react-native-sse. Парсер (sse.ts) от транспорта не зависит, поэтому
 * подмена транспорта не трогает эту функцию.
 */
export async function askStream(
  client: ApiClient,
  params: AskParams,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<StreamOutcome> {
  const body = buildAskRequest(params);
  const opened = await client.openStream('/v2/ask/stream', body, { signal });

  if (!opened.ok) {
    // 409 NOT_STREAMABLE: профиль base не стримится, потому что fact-check
    // требует полного ответа (B9). Уходим на /v2/ask молча.
    if (isNotStreamable(opened.status, opened.body)) {
      const outcome = await ask(client, params);
      handlers.onFallback?.(outcome);
      return { kind: "fellBack", outcome };
    }
    return { kind: "failed", error: opened.error };
  }

  const stream = opened.response.body;
  if (!stream) {
    // В React Native стандартный fetch не отдаёт ReadableStream (§5.4).
    // Если транспорт настроен неверно — не молчим, а падаем на /v2/ask.
    const outcome = await ask(client, params);
    handlers.onFallback?.(outcome);
    return { kind: "fellBack", outcome };
  }

  const parser = new SseParser();
  const decoder = new TextDecoder();
  const reader = stream.getReader();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        handlers.onEvent(event);
      }
    }
    // Хвост без завершающего \n\n — например при обрыве соединения.
    for (const event of parser.flush()) handlers.onEvent(event);
    return { kind: 'streamed' };
  } catch (error) {
    /**
     * Обрыв чтения. Раньше здесь не было catch, и это стоило дорого: reader
     * при отмене отклоняет промис с AbortError, тот пролетал сквозь askStream
     * и всплывал как необработанный. Хуже шума в логе то, что весь код ПОСЛЕ
     * await askStream в сторе переставал выполняться — чат навсегда оставался
     * в состоянии «генерирую», ответ не попадал в SQLite, а кнопка «Стоп» уже
     * не превращалась обратно в «Отправить».
     *
     * Отмена случается не только по кнопке: выход из аккаунта, таймаут и
     * обрыв связи отменяют тот же контроллер.
     */
    for (const event of parser.flush()) handlers.onEvent(event);

    if (isAbort(error, signal)) {
      // §5.4: отмена оставляет уже полученный текст и НЕ считается ошибкой.
      return { kind: 'streamed' };
    }

    // Разрыв посреди потока. Событие done не пришло, значит сервер ответ не
    // сохранил: при повторном открытии чат перечитывается с сервера (§6.4).
    return { kind: 'failed', error: { kind: 'timeout' } };
  } finally {
    reader.releaseLock();
  }
}

/**
 * Отмена это или настоящий сбой. Проверяем и по имени ошибки, и по сигналу:
 * имя AbortError даёт стандартный fetch, но у транспорта под RN оно может
 * отличаться, а сигнал в момент отмены взведён всегда.
 */
function isAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}
