import { describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import { MAX_ATTEMPTS, decideOutbox } from '../outboxPolicy';

/**
 * §17: «Сообщение, отправленное без сети, уходит при восстановлении связи
 * ровно один раз (без дублей)».
 *
 * Дубликат может возникнуть ровно в одном месте — если очередь сочтёт удачную
 * доставку неудачей и отправит вопрос заново. Поэтому проверяем в первую
 * очередь 202.
 */

const err = (kind: string) => ({ kind, message: '' }) as never;

describe('очередь отправки — решение о судьбе сообщения', () => {
  it('200 — доставлено, из очереди убирается', () => {
    expect(decideOutbox({ kind: 'answer' }, 0)).toEqual({ type: 'delivered' });
  });

  it('202 считается доставкой, а НЕ поводом отправить заново', () => {
    // Это и есть защита от дубля: B8 говорит, что тот же client_msg_id уже
    // обрабатывается. Повторная отправка создала бы второй вопрос в истории.
    expect(decideOutbox({ kind: 'inProgress' }, 0)).toEqual({ type: 'delivered' });
    // Даже на последней попытке 202 остаётся успехом.
    expect(decideOutbox({ kind: 'inProgress' }, MAX_ATTEMPTS)).toEqual({ type: 'delivered' });
  });

  it('исчерпанный лимит откладывает очередь, не тратя попытку', () => {
    expect(decideOutbox({ kind: 'error', error: err('limit') }, 0)).toEqual({ type: 'postpone' });
  });

  it('истёкшая сессия откладывает очередь: повтор без входа бессмыслен', () => {
    expect(decideOutbox({ kind: 'error', error: err('unauthorized') }, 2)).toEqual({
      type: 'postpone',
    });
  });

  it('сетевая ошибка — повтор, пока есть попытки', () => {
    expect(decideOutbox({ kind: 'error', error: err('offline') }, 0)).toEqual({ type: 'retry' });
    expect(decideOutbox({ kind: 'error', error: err('timeout') }, MAX_ATTEMPTS - 2)).toEqual({
      type: 'retry',
    });
  });

  it('после MAX_ATTEMPTS попыток сдаёмся и показываем пользователю', () => {
    expect(decideOutbox({ kind: 'error', error: err('server') }, MAX_ATTEMPTS - 1)).toEqual({
      type: 'giveUp',
    });
  });

  it('очередь не крутится бесконечно: попытки конечны', () => {
    let attempts = 0;
    for (let i = 0; i < 100; i += 1) {
      const action = decideOutbox({ kind: 'error', error: err('server') }, attempts);
      if (action.type === 'giveUp') break;
      attempts += 1;
    }
    expect(attempts).toBe(MAX_ATTEMPTS - 1);
  });
});
