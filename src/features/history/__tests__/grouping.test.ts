import { describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import { calendarDaysAgo, groupByDate, groupForDate } from '../grouping';

/** Опорный «сейчас»: 15 марта 2026, 10:30 локального времени. */
const NOW = new Date(2026, 2, 15, 10, 30);

const at = (day: number, hour = 12, minute = 0) => new Date(2026, 2, day, hour, minute);

describe('groupForDate', () => {
  it('сегодня — это календарный день, а не «минус 24 часа»', () => {
    expect(groupForDate(at(15, 0, 1), NOW)).toBe('history.today');
    expect(groupForDate(at(15, 23, 59), NOW)).toBe('history.today');
  });

  /**
   * Классическая ошибка: чат, созданный вчера в 23:50, при подсчёте по 24 часам
   * утром окажется «сегодняшним». Проверяем, что этого не происходит.
   */
  it('вчера в 23:50 остаётся «Дирӯз», хотя прошло меньше 24 часов', () => {
    expect(groupForDate(at(14, 23, 50), NOW)).toBe('history.yesterday');
  });

  it('границы 7 и 30 дней включающие', () => {
    expect(groupForDate(at(8), NOW)).toBe('history.prev7'); // ровно 7 дней назад
    expect(groupForDate(at(7), NOW)).toBe('history.prev30'); // 8 дней
    expect(groupForDate(new Date(2026, 1, 13), NOW)).toBe('history.prev30'); // 30 дней
    expect(groupForDate(new Date(2026, 1, 12), NOW)).toBe('history.older'); // 31 день
  });

  it('переживает переход через границу месяца', () => {
    expect(groupForDate(new Date(2026, 1, 28), new Date(2026, 2, 1, 9, 0))).toBe(
      'history.yesterday',
    );
  });

  it('чат «из будущего» при расхождении часов показывается как сегодняшний', () => {
    expect(groupForDate(at(16), NOW)).toBe('history.today');
  });

  it('принимает ISO-строку с сервера', () => {
    const iso = at(14).toISOString();
    expect(groupForDate(iso, NOW)).toBe('history.yesterday');
  });

  it('битую дату отправляет в «Пештар», а не роняет список', () => {
    expect(groupForDate('не-дата', NOW)).toBe('history.older');
    expect(calendarDaysAgo('не-дата', NOW)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('groupByDate', () => {
  const chats = [
    { id: 'a', updated_at: at(15, 9) },
    { id: 'b', updated_at: at(15, 8) },
    { id: 'c', updated_at: at(14) },
    { id: 'd', updated_at: at(10) },
    { id: 'e', updated_at: new Date(2026, 0, 5) },
  ];

  it('раскладывает по секциям в порядке §8.4', () => {
    const sections = groupByDate(chats, (c) => c.updated_at, NOW);
    expect(sections.map((s) => s.key)).toEqual([
      'history.today',
      'history.yesterday',
      'history.prev7',
      'history.older',
    ]);
  });

  it('пустые секции не создаются', () => {
    const sections = groupByDate([chats[0]], (c) => c.updated_at, NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('history.today');
  });

  it('сохраняет порядок внутри секции — список уже отсортирован по updated_at DESC', () => {
    const sections = groupByDate(chats, (c) => c.updated_at, NOW);
    expect(sections[0].items.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('пустой список даёт пустой результат', () => {
    expect(groupByDate([], (c: { updated_at: Date }) => c.updated_at, NOW)).toEqual([]);
  });
});
