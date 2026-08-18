import { describe, it } from 'node:test';

import { expect, fn } from '../../test/expect';
import { ApiClient, type AuthTokens, type TokenStore } from '../client';

/** Хранилище токенов в памяти — вместо Keychain (§11). */
function makeTokenStore(initial?: Partial<AuthTokens>): TokenStore & { current: AuthTokens | null } {
  const store = {
    current: initial
      ? { access_token: 'a0', refresh_token: 'r0', expires_in: 1800, ...initial }
      : null,
    getAccess: async () => store.current?.access_token ?? null,
    getRefresh: async () => store.current?.refresh_token ?? null,
    save: async (t: AuthTokens) => {
      store.current = t;
    },
    clear: async () => {
      store.current = null;
    },
  };
  return store;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;
type ClientDeps = ConstructorParameters<typeof ApiClient>[0];

function makeClient(handler: Handler, overrides: Partial<ClientDeps> = {}) {
  const tokens = makeTokenStore({});
  const onLogout = fn<() => void>();
  const fetchSpy = fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async (url, init) => handler(url, init),
  );

  const client = new ApiClient({
    baseUrl: 'http://mock',
    tokens,
    onLogout,
    isConnected: () => true,
    fetchImpl: fetchSpy as unknown as typeof fetch,
    // Ретраи тестируем без реального ожидания.
    sleep: async () => {},
    ...overrides,
  });

  return { client, tokens, onLogout, fetchImpl: fetchSpy };
}

describe('ApiClient — авторизация', () => {
  it('ставит заголовок Authorization: Bearer из хранилища', async () => {
    const { client, fetchImpl } = makeClient(() => jsonResponse(200, { ok: 1 }));
    await client.request('/auth/me');

    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer a0');
  });

  it('не ставит Authorization для анонимных запросов', async () => {
    const { client, fetchImpl } = makeClient(() => jsonResponse(200, {}));
    await client.request('/v1/config', { anonymous: true });

    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('на 401 рефрешит токен и повторяет запрос ровно один раз', async () => {
    let served = 0;
    const { client, tokens, onLogout } = makeClient((url) => {
      if (url.endsWith('/v1/auth/refresh')) {
        return jsonResponse(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 });
      }
      served += 1;
      return served === 1 ? jsonResponse(401, { detail: 'Not authenticated' }) : jsonResponse(200, { ok: 1 });
    });

    const result = await client.request<{ ok: number }>('/auth/me');

    // status добавлен ради B8: клиенту нужно отличать 200 от 202 (§6.6).
    expect(result).toEqual({ ok: true, data: { ok: 1 }, status: 200 });
    expect(served).toBe(2);
    // refresh_token ротируется при каждом использовании (§6.2).
    expect(tokens.current).toEqual({ access_token: 'a1', refresh_token: 'r1', expires_in: 1800 });
    expect(onLogout).not.toHaveBeenCalled();
  });

  /**
   * Ради этого мьютекс и существует: пачка параллельных 401 не должна сжечь
   * цепочку ротации refresh-токена и выкинуть живого пользователя на вход.
   */
  it('при десяти одновременных 401 делает РОВНО один запрос на /v1/auth/refresh', async () => {
    let refreshCalls = 0;
    const seen = new Set<string>();

    const { client, onLogout } = makeClient(async (url, init) => {
      if (url.endsWith('/v1/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((r) => setTimeout(r, 20)); // рефреш не мгновенный
        return jsonResponse(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 });
      }
      const auth = (init?.headers as Record<string, string>)?.Authorization;
      if (auth === 'Bearer a0') return jsonResponse(401, { detail: 'Not authenticated' });
      seen.add(auth ?? '');
      return jsonResponse(200, { url });
    });

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => client.request(`/v1/chat/${i}`)),
    );

    expect(refreshCalls).toBe(1);
    expect(results.every((r) => r.ok)).toBe(true);
    // Все повторы ушли уже с новым токеном.
    expect([...seen]).toEqual(['Bearer a1']);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('при провале рефреша делает логаут и отдаёт unauthorized', async () => {
    const { client, tokens, onLogout } = makeClient((url) =>
      url.endsWith('/v1/auth/refresh')
        ? jsonResponse(401, { detail: 'Not authenticated' })
        : jsonResponse(401, { detail: 'Not authenticated' }),
    );

    const result = await client.request('/auth/me');

    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } });
    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(tokens.current).toBeNull(); // Keychain очищен (§6.5)
  });

  it('не зацикливается, если сервер отдаёт 401 и после успешного рефреша', async () => {
    let refreshCalls = 0;
    const { client, onLogout } = makeClient((url) => {
      if (url.endsWith('/v1/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse(200, { access_token: 'a1', refresh_token: 'r1', expires_in: 1800 });
      }
      return jsonResponse(401, { detail: 'Not authenticated' });
    });

    const result = await client.request('/auth/me');

    expect(result).toEqual({ ok: false, error: { kind: 'unauthorized' } });
    expect(refreshCalls).toBe(1); // ровно один рефреш, без бесконечного цикла
    expect(onLogout).not.toHaveBeenCalled();
  });
});

describe('ApiClient — ретраи (§5.3)', () => {
  it('повторяет идемпотентный запрос до трёх раз при 5xx', async () => {
    let calls = 0;
    const { client } = makeClient(() => {
      calls += 1;
      return calls < 4 ? jsonResponse(503, { detail: {} }) : jsonResponse(200, { ok: 1 });
    });

    const result = await client.request('/v1/chat/list', { idempotent: true });

    expect(result.ok).toBe(true);
    expect(calls).toBe(4); // первая попытка + три ретрая
  });

  /**
   * POST /v2/ask без client_msg_id ретраить нельзя никогда (§5.3): повтор
   * спишет дневной лимит второй раз и создаст дубликат в истории (B8).
   */
  it('НЕ повторяет неидемпотентный запрос', async () => {
    let calls = 0;
    const { client } = makeClient(() => {
      calls += 1;
      return jsonResponse(503, { detail: {} });
    });

    const result = await client.request('/v2/ask', { method: 'POST', body: {} });

    expect(calls).toBe(1);
    expect(result).toEqual({ ok: false, error: { kind: 'server', status: 503, requestId: null } });
  });

  it('не повторяет 4xx — они не «починятся» сами', async () => {
    let calls = 0;
    const { client } = makeClient(() => {
      calls += 1;
      return jsonResponse(404, { detail: 'Chat not found' });
    });

    await client.request('/v1/chat/x', { idempotent: true });
    expect(calls).toBe(1);
  });

  it('не повторяет 429 — лимит исчерпан до полуночи по Душанбе', async () => {
    let calls = 0;
    const { client } = makeClient(() => {
      calls += 1;
      return jsonResponse(429, { detail: { resets_in_hours: 9, tier: 'free_email' } });
    });

    const result = await client.request('/v1/chat/list', { idempotent: true });

    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('limit');
  });
});

describe('ApiClient — сеть', () => {
  it('не ходит в сеть без соединения и сразу отдаёт offline', async () => {
    const { client, fetchImpl } = makeClient(() => jsonResponse(200, {}), {
      isConnected: () => false,
    });

    const result = await client.request('/auth/me');

    expect(result).toEqual({ ok: false, error: { kind: 'offline' } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('не падает, когда сервер отдал не-JSON вместо тела ошибки', async () => {
    const { client } = makeClient(
      () => new Response('<html>502 Bad Gateway</html>', { status: 502 }),
    );

    const result = await client.request('/auth/me');

    expect(result).toEqual({ ok: false, error: { kind: 'server', status: 502, requestId: null } });
  });
});
