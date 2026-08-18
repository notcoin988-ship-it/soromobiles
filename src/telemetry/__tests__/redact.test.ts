import { describe, it } from 'node:test';

import { expect } from '../../test/expect';
import { REDACTED, redactEvent, redactText, redactValue } from '../redact';

/**
 * §13: «Без PII: не отправлять текст сообщений, почту, токены».
 *
 * Это единственная преграда между перепиской школьников и внешним сервисом,
 * поэтому проверяется не «работает ли фильтр вообще», а каждый путь, которым
 * данные могут просочиться: поле объекта, вложенный объект, массив, свободный
 * текст сообщения об ошибке, URL.
 */

describe('вычистка PII перед отправкой в Sentry', () => {
  it('вырезает текст сообщения чата', () => {
    const event = { extra: { content: 'Салом, ман Фаррух. Кӯмак кун бо математика' } };
    const cleaned = redactEvent(event) as { extra: { content: string } };
    expect(cleaned.extra.content).toBe(REDACTED);
  });

  it('вырезает почту и в поле, и в свободном тексте', () => {
    expect(redactText('вход не удался для farrux@mail.tj')).toBe(`вход не удался для ${REDACTED}`);

    const cleaned = redactEvent({ user: { email: 'a@b.tj' }, message: 'ok' });
    expect(cleaned.user).toBe(undefined);
  });

  it('вырезает токены — и в поле, и в заголовке Authorization', () => {
    const event = {
      request: {
        headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdef' },
      },
      extra: { access_token: 'mock-access.9f2c1b' },
    };
    const cleaned = redactEvent(event) as {
      request: { headers: { Authorization: string } };
      extra: { access_token: string };
    };

    expect(cleaned.extra.access_token).toBe(REDACTED);
    expect(cleaned.request.headers.Authorization.includes('eyJhbGci')).toBe(false);
  });

  it('вырезает код подтверждения из письма', () => {
    expect(redactText('invalid code 407284').includes('407284')).toBe(false);
  });

  it('вырезает всю историю сообщений, а не только последнее', () => {
    const event = {
      extra: { messages: [{ role: 'user', content: 'секрет' }] },
    };
    const cleaned = redactEvent(event) as { extra: { messages: string } };
    expect(cleaned.extra.messages).toBe(REDACTED);
  });

  it('чистит вложенные структуры на любой глубине', () => {
    const event = { contexts: { a: { b: { c: { email: 'x@y.tj' } } } } };
    const cleaned = redactEvent(event) as {
      contexts: { a: { b: { c: { email: string } } } };
    };
    expect(cleaned.contexts.a.b.c.email).toBe(REDACTED);
  });

  it('не зависает на слишком глубоком дереве', () => {
    // Событие Sentry приходит из чужого кода; падать или зависать в
    // beforeSend нельзя — иначе не уйдёт ни один отчёт.
    let deep: Record<string, unknown> = { email: 'a@b.tj' };
    for (let i = 0; i < 50; i += 1) deep = { nested: deep };
    expect(typeof redactValue(deep)).toBe('object');
  });

  it('оставляет то, ради чего отчёт и нужен', () => {
    // Тип ошибки, код и стек — не PII, и без них отчёт бесполезен.
    const event = {
      exception: { values: [{ type: 'TypeError', value: 'undefined is not a function' }] },
      tags: { screen: 'chat', errorKind: 'timeout' },
    };
    const cleaned = redactEvent(event) as {
      exception: { values: { type: string; value: string }[] };
      tags: { screen: string; errorKind: string };
    };

    expect(cleaned.exception.values[0].type).toBe('TypeError');
    expect(cleaned.tags.screen).toBe('chat');
    expect(cleaned.tags.errorKind).toBe('timeout');
  });

  it('короткие безобидные строки не портятся', () => {
    expect(redactText('Не удалось загрузить чат')).toBe('Не удалось загрузить чат');
    expect(redactText('HTTP 500')).toBe('HTTP 500');
  });
});
