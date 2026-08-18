import { describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import { isLocalChatId, newLocalChatId } from '../localChatId';

/**
 * Локальный id не должен уходить на сервер: /v2/ask с чужим chat_id вернёт
 * 404, а сообщение зависнет в очереди навсегда. Отличать его от серверного
 * приходится по строке, поэтому проверяем именно распознавание.
 */
describe('локальный идентификатор чата', () => {
  it('распознаётся как локальный', () => {
    expect(isLocalChatId(newLocalChatId('9d2f3a10-0000-4000-8000-000000000000'))).toBe(true);
  });

  it('серверный UUID локальным не считается', () => {
    // Серверные id — UUID, двоеточий в них не бывает.
    expect(isLocalChatId('9d2f3a10-0000-4000-8000-000000000000')).toBe(false);
  });

  it('не путается с id, где префикс стоит не в начале', () => {
    expect(isLocalChatId('chat-local:1')).toBe(false);
  });

  it('пустая строка локальной не считается', () => {
    expect(isLocalChatId('')).toBe(false);
  });
});
