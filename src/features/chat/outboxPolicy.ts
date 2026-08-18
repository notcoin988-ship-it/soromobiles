import type { ApiError } from '../../api/errors';

/**
 * Решение о судьбе сообщения в очереди (§5.5) — чистая функция без импорта
 * базы и сети, чтобы «ровно один раз» из §17 проверялось тестами, а не
 * наблюдением за приложением в режиме полёта.
 *
 * Логика вынесена из drainOutbox намеренно: сам разбор очереди — это работа с
 * SQLite и HTTP, его в node не запустить, а решают тут четыре строчки, в
 * которых и живут все ошибки.
 */

export const MAX_ATTEMPTS = 3;

export type OutboxOutcome =
  | { kind: 'answer' }
  /** B8: тот же client_msg_id уже обрабатывается сервером. */
  | { kind: 'inProgress' }
  | { kind: 'error'; error: ApiError };

export type OutboxAction =
  /** Доставлено — убрать из очереди. */
  | { type: 'delivered' }
  /** Отложить всю очередь: повторы сейчас бессмысленны. */
  | { type: 'postpone' }
  /** Попробовать позже, попытка израсходована. */
  | { type: 'retry' }
  /** Попытки исчерпаны — показать пользователю. */
  | { type: 'giveUp' };

export function decideOutbox(outcome: OutboxOutcome, attempts: number): OutboxAction {
  /**
   * 202 — это НЕ ошибка. Сообщение на сервере есть, ответ генерируется.
   * Если считать 202 неудачей, очередь будет слать один и тот же вопрос по
   * кругу — ровно тот дубликат, который §17 запрещает.
   */
  if (outcome.kind === 'answer' || outcome.kind === 'inProgress') return { type: 'delivered' };

  /**
   * Лимит исчерпан или сессия истекла — повтор через минуту ничего не изменит,
   * а попытки сожжёт. Откладываем всю очередь целиком.
   */
  if (outcome.error.kind === 'limit' || outcome.error.kind === 'unauthorized') {
    return { type: 'postpone' };
  }

  return attempts + 1 >= MAX_ATTEMPTS ? { type: 'giveUp' } : { type: 'retry' };
}
