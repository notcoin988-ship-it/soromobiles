import { describe, it } from 'node:test';

import { expect, fn } from '../../test/expect';
import { ApiClient, type AuthTokens, type TokenStore } from '../client';
import { askStream } from '../endpoints/ask';

/**
 * Обрыв чтения потока (§5.4, §6.4).
 *
 * Найдено крэш-тестом на устройстве: reader при отмене отклоняет промис с
 * AbortError, а обработчика не было. В логе появлялось «Uncaught (in promise)»,
 * но настоящий ущерб был не в этом: исключение пролетало сквозь askStream, и
 * весь код ПОСЛЕ него в сторе не выполнялся. Чат оставался в состоянии
 * «генерирую» навсегда, ответ не сохранялся в SQLite, кнопка «Стоп» не
 * возвращалась в «Отправить».
 */

function makeTokenStore(): TokenStore {
  const current: AuthTokens = { access_token: 'a', refresh_token: 'r', expires_in: 1800 };
  return {
    getAccess: async () => current.access_token,
    getRefresh: async () => current.refresh_token,
    save: async () => {},
    clear: async () => {},
  };
}

/**
 * Поток, который отдаёт несколько записей, а затем падает. Так ведёт себя
 * настоящий reader: часть данных уже пришла, и терять её нельзя.
 */
function streamThatFails(chunks: string[], failure: unknown): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    getReader() {
      return {
        read: async () => {
          if (index < chunks.length) {
            const value = encoder.encode(chunks[index]);
            index += 1;
            return { done: false, value };
          }
          throw failure;
        },
        releaseLock: () => {},
      };
    },
  } as unknown as ReadableStream<Uint8Array>;
}

function makeClient(stream: ReadableStream<Uint8Array>) {
  return new ApiClient({
    baseUrl: 'http://mock',
    tokens: makeTokenStore(),
    onLogout: () => {},
    isConnected: () => true,
    fetchImpl: fn(async () => ({ ok: true, status: 200, body: stream }) as unknown as Response),
  });
}

const PARAMS = { chatId: 'c1', question: 'савол' };

describe('обрыв чтения потока', () => {
  it('отмена не выбрасывает исключение наружу', async () => {
    const abort = new AbortController();
    const error = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    const client = makeClient(streamThatFails(['event: token\ndata: {"t":"Ду"}\n\n'], error));

    const events: string[] = [];
    abort.abort();

    // Раньше этот вызов отклонялся, и await в сторе никогда не возвращался.
    const outcome = await askStream(
      client,
      PARAMS,
      { onEvent: (e) => events.push(e.type) },
      abort.signal,
    );

    expect(outcome.kind).toBe('streamed');
    // §5.4: полученный до отмены текст остаётся.
    expect(events.includes('token')).toBe(true);
  });

  it('отмена распознаётся по имени ошибки, даже если сигнал не передан', async () => {
    // Транспорт под RN — не стандартный fetch, и сигнала может не быть.
    const error = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const client = makeClient(streamThatFails([], error));

    const outcome = await askStream(client, PARAMS, { onEvent: () => {} });
    expect(outcome.kind).toBe('streamed');
  });

  it('разрыв связи посреди потока — это ошибка, а не отмена', async () => {
    // Событие done не пришло: сервер ответ не сохранил, и пользователю нужно
    // показать сбой, а не тишину.
    const client = makeClient(streamThatFails(['event: token\ndata: {"t":"a"}\n\n'], new Error('ECONNRESET')));

    const outcome = await askStream(client, PARAMS, { onEvent: () => {} });
    expect(outcome.kind).toBe('failed');
  });

  it('незавершённая запись на хвосте всё равно доходит до обработчика', async () => {
    // Запись без закрывающего \n\n: парсер обязан отдать её при flush,
    // иначе последний кусок ответа теряется на каждом обрыве.
    const error = Object.assign(new Error('stop'), { name: 'AbortError' });
    const client = makeClient(streamThatFails(['event: token\ndata: {"t":"хвост"}'], error));

    const events: unknown[] = [];
    const outcome = await askStream(client, PARAMS, { onEvent: (e) => events.push(e) });

    expect(outcome.kind).toBe('streamed');
    expect(events.length).toBe(1);
  });
});
