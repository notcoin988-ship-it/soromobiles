import { beforeEach, describe, it } from 'node:test';

import { expect } from '../../test/expect';
import {
  pendingCount,
  resetEvents,
  setEventSink,
  toPayload,
  track,
  type EventPayload,
} from '../events';
import {
  REQUEST_LOG_SIZE,
  clearRequestLog,
  formatForSupport,
  normalizePath,
  recentRequests,
  rememberRequest,
  requestIdOf,
} from '../requestLog';

describe('счётчики событий (§13)', () => {
  beforeEach(() => {
    resetEvents();
  });

  it('события до инициализации не теряются', () => {
    // app_open случается на старте, раньше чем поднимется отправка.
    track({ name: 'app_open' });
    expect(pendingCount()).toBe(1);

    const sent: EventPayload[] = [];
    setEventSink((p) => sent.push(p));

    expect(sent.length).toBe(1);
    expect(sent[0].name).toBe('app_open');
    expect(pendingCount()).toBe(0);
  });

  it('очередь ожидания не растёт без границы', () => {
    // Без предела приложение без сети копило бы события всю сессию.
    for (let i = 0; i < 100; i += 1) track({ name: 'message_sent' });
    expect(pendingCount() <= 20).toBe(true);
  });

  it('ошибка отправки не выходит наружу', () => {
    setEventSink(() => {
      throw new Error('сеть недоступна');
    });
    // Аналитика не имеет права ронять экран.
    track({ name: 'message_sent' });
  });

  it('error_shown несёт вид ошибки, а не её текст', () => {
    const payload = toPayload({ name: 'error_shown', kind: 'limit' });
    expect(payload.kind).toBe('limit');
    // В теле только имя, вид и время — ничего, что связано с человеком.
    expect(Object.keys(payload).sort().join(',')).toBe('at,kind,name');
  });

  it('обычное событие не содержит ничего, кроме имени и времени', () => {
    const payload = toPayload({ name: 'app_open' });
    expect(Object.keys(payload).sort().join(',')).toBe('at,name');
  });
});

describe('кольцевой буфер request_id (§13)', () => {
  beforeEach(() => {
    clearRequestLog();
  });

  it('хранит не больше ста записей', () => {
    for (let i = 0; i < 250; i += 1) {
      rememberRequest({ requestId: `r${i}`, path: '/v2/ask', status: 200, at: i });
    }
    expect(recentRequests().length).toBe(REQUEST_LOG_SIZE);
    // Остаются свежие, а не первые попавшиеся.
    expect(recentRequests()[REQUEST_LOG_SIZE - 1].requestId).toBe('r249');
  });

  it('достаёт request_id и из успешного ответа, и из ошибки', () => {
    expect(requestIdOf({ request_id: 'abc' })).toBe('abc');
    // §6.5 заворачивает его в detail.
    expect(requestIdOf({ detail: { request_id: 'xyz', message: 'лимит' } })).toBe('xyz');
    expect(requestIdOf({ detail: 'Not authenticated' })).toBe(null);
    expect(requestIdOf(null)).toBe(null);
    expect(requestIdOf('строка')).toBe(null);
  });

  it('query отбрасывается: там бывает почта при восстановлении пароля', () => {
    expect(normalizePath('/v1/auth/password/forgot?email=a@b.tj')).toBe('/v1/auth/password/forgot');
  });

  it('идентификатор чата в пути заменяется — иначе не сгруппировать', () => {
    expect(normalizePath('/v1/chat/79eaae1a-7572-426a-98ac-63896d934ffb/rename')).toBe(
      '/v1/chat/{id}/rename',
    );
  });

  it('текст для поддержки идёт свежими записями вперёд', () => {
    rememberRequest({ requestId: 'старый', path: '/a', status: 200, at: 1 });
    rememberRequest({ requestId: 'свежий', path: '/b', status: 500, at: 2 });

    const text = formatForSupport();
    expect(text.indexOf('свежий') < text.indexOf('старый')).toBe(true);
    // Сбой, из-за которого пишут в поддержку, почти всегда последний.
    expect(text.includes('500')).toBe(true);
  });
});
