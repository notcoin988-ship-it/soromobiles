import { describe, it } from 'node:test';

import { expect, fn } from '../../test/expect';
import { ApiClient, type AuthTokens, type TokenStore } from '../client';
import { ask } from '../endpoints/ask';

/**
 * B8 — идемпотентность отправки (§6.6).
 *
 * Ключевое различие, которое легко потерять: 200 и 202 оба успешны по HTTP,
 * но означают противоположное.
 *   200 — ответ готов;
 *   202 — тот же вопрос уже обрабатывается, повторно слать НЕЛЬЗЯ.
 *
 * Без разделения повтор после обрыва связи показал бы пользователю пустой
 * ответ модели: тело 202 не содержит поля response.
 */

function makeTokenStore(): TokenStore {
  let current: AuthTokens | null = { access_token: 'a0', refresh_token: 'r0', expires_in: 1800 };
  return {
    getAccess: async () => current?.access_token ?? null,
    getRefresh: async () => current?.refresh_token ?? null,
    save: async (t) => {
      current = t;
    },
    clear: async () => {
      current = null;
    },
  };
}

function makeClient(handler: (url: string, init?: RequestInit) => Response) {
  const fetchSpy = fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url, init) =>
    handler(url, init),
  );

  const client = new ApiClient({
    baseUrl: 'http://mock',
    tokens: makeTokenStore(),
    onLogout: () => {},
    isConnected: () => true,
    fetchImpl: fetchSpy as unknown as typeof fetch,
    sleep: async () => {},
  });

  return { client, fetchSpy };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const ANSWER = {
  response: 'Қуллаи Исмоили Сомонӣ',
  model: 'light',
  request_id: 'req-1',
  message_id: 'msg-1',
  sources: [],
};

describe('ask — различение 200 и 202 (B8)', () => {
  it('200 отдаёт готовый ответ', async () => {
    const { client } = makeClient(() => json(200, ANSWER));
    const outcome = await ask(client, { chatId: 'c1', question: 'Салом' });

    expect(outcome.kind).toBe('answer');
    if (outcome.kind === 'answer') {
      expect(outcome.data.response).toBe('Қуллаи Исмоили Сомонӣ');
    }
  });

  it('202 распознаётся как «генерация идёт», а не как пустой ответ', async () => {
    const { client } = makeClient(() => json(202, { request_id: 'req-9', status: 'generating' }));
    const outcome = await ask(client, {
      chatId: 'c1',
      question: 'Салом',
      clientMsgId: 'cmid-1',
    });

    expect(outcome.kind).toBe('inProgress');
    if (outcome.kind === 'inProgress') {
      expect(outcome.requestId).toBe('req-9');
    }
  });

  it('202 НЕ выдаётся за ответ модели — иначе в чате появится пустой пузырь', async () => {
    const { client } = makeClient(() => json(202, { request_id: 'req-9', status: 'generating' }));
    const outcome = await ask(client, { chatId: 'c1', question: 'Салом', clientMsgId: 'x' });

    // Главная проверка: не 'answer'. Тело 202 не содержит response вовсе.
    expect(outcome.kind).not.toBe('answer');
  });

  it('ошибка остаётся ошибкой', async () => {
    const { client } = makeClient(() => json(503, { detail: {} }));
    const outcome = await ask(client, { chatId: 'c1', question: 'Салом' });

    expect(outcome.kind).toBe('error');
  });
});

describe('client_msg_id в теле запроса (B8)', () => {
  it('передаётся на сервер, когда задан', async () => {
    const { client, fetchSpy } = makeClient(() => json(200, ANSWER));
    await client.request('/v2/ask', { method: 'POST', body: { client_msg_id: 'cmid-7' } });

    const sent = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(sent.client_msg_id).toBe('cmid-7');
  });

  /**
   * §5.3: «POST /v2/ask без client_msg_id не ретраить никогда» — повтор без
   * идентификатора создаст дубликат в истории и спишет лимит второй раз.
   */
  it('без client_msg_id запрос НЕ ретраится при 5xx', async () => {
    let calls = 0;
    const { client } = makeClient(() => {
      calls += 1;
      return json(503, { detail: {} });
    });

    await ask(client, { chatId: 'c1', question: 'Салом' });
    expect(calls).toBe(1);
  });

  it('с client_msg_id ретраи разрешены — сервер отсечёт дубликат', async () => {
    let calls = 0;
    const { client } = makeClient(() => {
      calls += 1;
      return calls < 3 ? json(503, { detail: {} }) : json(200, ANSWER);
    });

    const outcome = await ask(client, {
      chatId: 'c1',
      question: 'Салом',
      clientMsgId: 'cmid-2',
    });

    expect(calls).toBe(3);
    expect(outcome.kind).toBe('answer');
  });
});

describe('chat_title из ответа сервера (B10)', () => {
  it('заголовок подхватывается, когда сервер его прислал', async () => {
    const { client } = makeClient(() => json(200, { ...ANSWER, chat_title: 'Қуллаҳои Тоҷикистон' }));
    const outcome = await ask(client, { chatId: 'c1', question: 'Салом' });

    expect(outcome.kind).toBe('answer');
    if (outcome.kind === 'answer') {
      expect(outcome.data.chat_title).toBe('Қуллаҳои Тоҷикистон');
    }
  });

  /**
   * Пока B10 не реализован, поля просто нет — клиент должен это пережить и
   * уйти на обходной путь через PATCH /rename (§6.6).
   */
  it('отсутствие chat_title не ломает разбор ответа', async () => {
    const { client } = makeClient(() => json(200, ANSWER));
    const outcome = await ask(client, { chatId: 'c1', question: 'Салом' });

    expect(outcome.kind).toBe('answer');
    if (outcome.kind === 'answer') {
      expect(outcome.data.chat_title).toBeUndefined();
    }
  });
});
