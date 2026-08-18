import { describe, it } from 'node:test';

import { expect } from '../../test/expect';
import { MAX_CONTEXT_PAIRS, buildAskRequest, buildContext } from '../endpoints/ask';
import type { AskMessage } from '../types';

/**
 * Контекст диалога (§6.3.3).
 *
 * ПРОВЕРЕНО НА ЖИВОМ ПРОДЕ: сервер НЕ помнит переписку по chat_id. Если сказать
 * модели «Меня зовут Фаррух», а следующий вопрос отправить без истории — она
 * отвечает про себя, а не про пользователя. С историей от клиента отвечает
 * верно.
 *
 * Значит вся память чата держится на buildContext, и подстраховки со стороны
 * сервера нет. Ошибка здесь превращает приложение в беспамятное.
 */

const pair = (n: number): AskMessage[] => [
  { role: 'user', content: `вопрос ${n}` },
  { role: 'assistant', content: `ответ ${n}` },
];

describe('buildContext', () => {
  it('к пустой истории добавляет только новый вопрос', () => {
    expect(buildContext([], 'Салом')).toEqual([{ role: 'user', content: 'Салом' }]);
  });

  it('сохраняет пару «вопрос-ответ» и добавляет новый вопрос', () => {
    const result = buildContext(pair(1), 'Нав');
    expect(result).toEqual([
      { role: 'user', content: 'вопрос 1' },
      { role: 'assistant', content: 'ответ 1' },
      { role: 'user', content: 'Нав' },
    ]);
  });

  it('берёт последние 4 пары, а не первые (§6.3.3)', () => {
    const history = [1, 2, 3, 4, 5, 6].flatMap(pair);
    const result = buildContext(history, 'Нав');

    // 4 пары = 8 сообщений + новый вопрос.
    expect(result).toHaveLength(MAX_CONTEXT_PAIRS * 2 + 1);
    expect(result[0]).toEqual({ role: 'user', content: 'вопрос 3' });
    expect(result.at(-1)).toEqual({ role: 'user', content: 'Нав' });
  });

  it('ровно 4 пары проходят целиком — граница включающая', () => {
    const history = [1, 2, 3, 4].flatMap(pair);
    expect(buildContext(history, 'Нав')).toHaveLength(9);
  });

  /**
   * Роли обязаны строго чередоваться user/assistant, иначе сервер отвергает
   * тело запроса. Это главный инвариант функции.
   */
  it('роли строго чередуются на любой длине истории', () => {
    for (const count of [1, 2, 3, 4, 5, 8]) {
      const result = buildContext(
        Array.from({ length: count }, (_, i) => pair(i + 1)).flat(),
        'Нав',
      );
      for (let i = 0; i < result.length; i += 1) {
        const expected = i % 2 === 0 ? 'user' : 'assistant';
        expect(result[i].role, `история из ${count} пар, позиция ${i}`).toBe(expected);
      }
    }
  });

  it('отбрасывает незавершённую пару: вопрос без ответа не ломает чередование', () => {
    // Такое бывает, когда генерация оборвалась и ответ не сохранился (§6.4).
    const history: AskMessage[] = [...pair(1), { role: 'user', content: 'без ответа' }];
    const result = buildContext(history, 'Нав');

    expect(result).toEqual([
      { role: 'user', content: 'вопрос 1' },
      { role: 'assistant', content: 'ответ 1' },
      { role: 'user', content: 'Нав' },
    ]);
  });

  it('не спотыкается об ответ ассистента без предшествующего вопроса', () => {
    const history: AskMessage[] = [{ role: 'assistant', content: 'сирота' }, ...pair(1)];
    const result = buildContext(history, 'Нав');
    expect(result[0]).toEqual({ role: 'user', content: 'вопрос 1' });
  });
});

describe('buildAskRequest', () => {
  /**
   * На сервере use_rag по умолчанию true (подтверждено в docs/openapi.json).
   * Пропущенное поле молча включит веб-поиск через Tavily, который вне объёма
   * v1.0 (§1). Поэтому false передаётся ЯВНО, и этот тест сторожит инвариант.
   */
  it('ВСЕГДА передаёт use_rag: false явным образом', () => {
    const request = buildAskRequest({ chatId: 'c1', question: 'Салом' });
    expect(request.use_rag).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(request, 'use_rag')).toBe(true);
  });

  it('по умолчанию профиль fast — единственный, который умеет стримить', () => {
    expect(buildAskRequest({ chatId: 'c1', question: 'Салом' }).model).toBe('fast');
  });

  it('вложения вне объёма v1.0 — attachment_ids всегда null', () => {
    expect(buildAskRequest({ chatId: 'c1', question: 'Салом' }).attachment_ids).toBeNull();
  });

  it('client_msg_id добавляется только когда он задан (B8)', () => {
    const without = buildAskRequest({ chatId: 'c1', question: 'Салом' });
    expect(Object.prototype.hasOwnProperty.call(without, 'client_msg_id')).toBe(false);

    const with_ = buildAskRequest({ chatId: 'c1', question: 'Салом', clientMsgId: 'id-1' });
    expect(with_.client_msg_id).toBe('id-1');
  });

  it('класс обучения прокидывается, по умолчанию null', () => {
    expect(buildAskRequest({ chatId: 'c1', question: 'x' }).class_level).toBeNull();
    expect(buildAskRequest({ chatId: 'c1', question: 'x', classLevel: 'g5_6' }).class_level).toBe(
      'g5_6',
    );
  });

  it('история попадает в запрос вместе с новым вопросом', () => {
    const request = buildAskRequest({
      chatId: 'c1',
      question: 'Номи ман чист?',
      history: [
        { role: 'user', content: 'Номи ман Фаррух' },
        { role: 'assistant', content: 'Салом, Фаррух!' },
      ],
    });

    expect(request.messages).toHaveLength(3);
    expect(request.messages[0].content).toBe('Номи ман Фаррух');
    expect(request.messages.at(-1)?.content).toBe('Номи ман чист?');
  });
});
