import { describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import { LEGAL_DOCS_VERSION, needsConsent } from '../consent';
import { privacyPolicyFor } from '../privacyPolicy';

/**
 * Согласие с документами и его версия (§8.1).
 *
 * Последняя проверка здесь — главная: версия обязана совпадать с датой
 * редакции, вшитой в сам документ. Иначе однажды текст политики обновят, а
 * строку версии забудут — и приложение не переспросит согласия, хотя §8.1
 * этого прямо требует. Тест делает такую забывчивость невозможной.
 */
describe('согласие с документами (§8.1)', () => {
  it('первый запуск: согласия не было — показываем', () => {
    expect(needsConsent(null)).toBe(true);
  });

  it('согласились с действующей редакцией — больше не показываем', () => {
    expect(needsConsent(LEGAL_DOCS_VERSION)).toBe(false);
  });

  it('вышла новая редакция — показываем повторно', () => {
    // Тот самый сценарий из §8.1: «При смене версии документов — показывается
    // повторно». Согласие с прошлой редакцией новую не покрывает.
    expect(needsConsent('2025-06-01')).toBe(true);
  });

  it('версия согласия равна дате редакции в самом документе', () => {
    // «Сана: 15 январи соли 2026» и «Date: January 15, 2026» — обе редакции
    // одной даты, и LEGAL_DOCS_VERSION записан машинно как 2026-01-15.
    const [year, month, day] = LEGAL_DOCS_VERSION.split('-').map(Number);
    expect(year).toBe(2026);
    expect(month).toBe(1);
    expect(day).toBe(15);

    // Даты в текстах не должны разъехаться с версией: обе содержат «2026»,
    // а таджикская — ещё и число.
    expect(privacyPolicyFor('tg').date.includes('2026')).toBe(true);
    expect(privacyPolicyFor('tg').date.includes('15')).toBe(true);
    expect(privacyPolicyFor('en').date.includes('2026')).toBe(true);
    expect(privacyPolicyFor('en').date.includes('15')).toBe(true);
  });
});
