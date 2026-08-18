import { describe, it } from 'node:test';

import { expect } from '../../test/expect';
import {
  apiErrorFromResponse,
  authErrorCode,
  isNotStreamable,
  messageKeyFor,
  shouldReportToSentry,
} from '../errors';

describe('apiErrorFromResponse — таблица §6.5', () => {
  it('401 → unauthorized', () => {
    expect(apiErrorFromResponse(401, { detail: 'Not authenticated' })).toEqual({
      kind: 'unauthorized',
    });
  });

  it('403 → validation со статусом, UI покажет «Дастрасӣ нест»', () => {
    const error = apiErrorFromResponse(403, { detail: 'Access denied' });
    expect(error).toEqual({ kind: 'validation', status: 403, message: 'Access denied' });
    expect(messageKeyFor(error)).toBe('errors.accessDenied');
  });

  it('404 → validation со статусом 404', () => {
    expect(apiErrorFromResponse(404, { detail: 'Chat not found' })).toEqual({
      kind: 'validation',
      status: 404,
      message: 'Chat not found',
    });
  });

  it('422 → validation и уходит в Sentry как баг клиента', () => {
    const error = apiErrorFromResponse(422, { detail: [{ loc: ['body'], msg: 'field required' }] });
    expect(error.kind).toBe('validation');
    expect(shouldReportToSentry(error)).toBe(true);
  });

  it('5xx → server с request_id для поддержки', () => {
    expect(
      apiErrorFromResponse(503, { detail: { message: 'oops', request_id: 'req-9' } }),
    ).toEqual({ kind: 'server', status: 503, requestId: 'req-9' });
  });

  it('5xx без request_id не выдумывает его', () => {
    expect(apiErrorFromResponse(500, {})).toEqual({
      kind: 'server',
      status: 500,
      requestId: null,
    });
  });
});

describe('apiErrorFromResponse — 429 (§6.3.4, §8.6)', () => {
  const body = {
    detail: {
      message: 'Лимити имрӯзаи шумо тамом шуд. То навсозӣ тақрибан 9 соат мондааст (соат 00:00).',
      resets_at: '2026-08-09T00:00:00+05:00',
      resets_at_local: '00:00',
      resets_in_hours: 9,
      tier: 'free_email',
      request_id: 'req-1',
    },
  };

  it('раскладывает тело лимита по полям', () => {
    expect(apiErrorFromResponse(429, body)).toEqual({
      kind: 'limit',
      message: body.detail.message,
      resetsInHours: 9,
      resetsAtLocal: '00:00',
      tier: 'free_email',
    });
  });

  it('не падает, если сервер прислал 429 с пустым телом', () => {
    expect(apiErrorFromResponse(429, undefined)).toEqual({
      kind: 'limit',
      message: '',
      resetsInHours: null,
      resetsAtLocal: null,
      tier: null,
    });
  });

  it('игнорирует поля неверного типа вместо того, чтобы их протащить', () => {
    const error = apiErrorFromResponse(429, {
      detail: { resets_in_hours: 'девять', tier: 42 },
    });
    expect(error).toMatchObject({ resetsInHours: null, tier: null });
  });
});

describe('устойчивость к мусорному телу', () => {
  for (const body of [undefined, null, '', 'ой', 0, [], { detail: null }, { detail: 123 }]) {
    it(`не бросает на теле ${JSON.stringify(body) ?? String(body)}`, () => {
      expect(() => apiErrorFromResponse(500, body)).not.toThrow();
    });
  }

  it('detail-строка становится сообщением, detail-объект отдаёт .message', () => {
    expect(apiErrorFromResponse(400, { detail: 'просто строка' })).toMatchObject({
      message: 'просто строка',
    });
    expect(apiErrorFromResponse(400, { detail: { message: 'из объекта' } })).toMatchObject({
      message: 'из объекта',
    });
  });
});

describe('isNotStreamable — фолбэк §5.4', () => {
  it('распознаёт 409 с профилем base', () => {
    const body = { detail: { message: 'Base is not streamable; use /v2/ask', profile: 'base' } };
    expect(isNotStreamable(409, body)).toBe(true);
  });

  it('не путает с 409 на регистрации («почта уже занята»)', () => {
    expect(isNotStreamable(409, { detail: { code: 'email_taken' } })).toBe(false);
  });

  it('не срабатывает на других статусах', () => {
    expect(isNotStreamable(500, { detail: { profile: 'base' } })).toBe(false);
  });
});

describe('authErrorCode — формы авторизации §6.6', () => {
  for (const code of [
    'email_taken',
    'bad_credentials',
    'email_not_verified',
    'invalid_code',
    'expired_code',
  ]) {
    it(`достаёт код ${code}`, () => {
      expect(authErrorCode({ detail: { code } })).toBe(code);
    });
  }

  it('возвращает null, когда кода нет', () => {
    expect(authErrorCode({ detail: 'Not authenticated' })).toBeNull();
  });
});

describe('messageKeyFor — единственный мост из api/ в тексты UI', () => {
  const cases = [
    [{ kind: 'offline' as const }, 'errors.offline'],
    [{ kind: 'timeout' as const }, 'errors.slow'],
    [{ kind: 'unauthorized' as const }, 'errors.needSignIn'],
  ] as const;

  for (const [error, key] of cases) {
    it(`${error.kind} → ${key}`, () => {
      expect(messageKeyFor(error)).toBe(key);
    });
  }

  it('три состояния ошибки различимы, а не свалены в одно (§8.7)', () => {
    const keys = new Set([
      messageKeyFor({ kind: 'offline' }),
      messageKeyFor({ kind: 'timeout' }),
      messageKeyFor({ kind: 'server', status: 500, requestId: null }),
    ]);
    expect(keys.size).toBe(3);
  });
});
