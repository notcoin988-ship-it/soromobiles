import { describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import { chatErrorKey } from '../errorMessages';
import tg from '../../../i18n/tg.json';
import ru from '../../../i18n/ru.json';
import en from '../../../i18n/en.json';

/**
 * Сообщения об ошибках в ленте чата (§8.7).
 *
 * §8.7 требует «три различимых состояния ошибки, а не одно „Ошибка“». Тест
 * следит за тем, чтобы разные причины не схлопнулись в одну строку: это
 * происходит незаметно — достаточно одному case вернуть чужой ключ.
 */
describe('ошибки в ленте чата (§8.7)', () => {
  it('5xx при вопросе — это «модель не отвечает», а не «сервер недоступен»', () => {
    // Бэкенд ответил, движок за ним — нет. Человеку, который ждёт ответа на
    // свой вопрос, «сервер недоступен» ничего не объясняет: приложение перед
    // ним работает, список чатов открывается.
    expect(chatErrorKey('server')).toBe('errors.modelUnavailable');
  });

  it('остальные причины сохраняют свои сообщения', () => {
    expect(chatErrorKey('offline')).toBe('errors.offline');
    expect(chatErrorKey('timeout')).toBe('errors.slow');
    expect(chatErrorKey('unauthorized')).toBe('errors.needSignIn');
    expect(chatErrorKey('limit')).toBe('errors.limitReached');
    expect(chatErrorKey('validation')).toBe('errors.genericError');
  });

  it('причины не схлопываются: у каждой свой текст', () => {
    const kinds = ['offline', 'timeout', 'server', 'unauthorized', 'limit', 'validation'] as const;
    const keys = kinds.map(chatErrorKey);
    expect(new Set(keys).size).toBe(kinds.length);
  });

  it('текст есть во всех трёх словарях и он не пустой', () => {
    // Без ключа i18next покажет «errors.modelUnavailable» прямо на экране.
    for (const dictionary of [tg, ru, en]) {
      expect(typeof dictionary.errors.modelUnavailable).toBe('string');
      expect(dictionary.errors.modelUnavailable.length > 20).toBe(true);
    }
  });
});
