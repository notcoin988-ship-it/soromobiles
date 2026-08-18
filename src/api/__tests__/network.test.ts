import { describe, it } from 'node:test';

import { expect } from '../../test/expect';
import { resolveConnectivity, type ConnectivitySnapshot } from '../connectivity';

/**
 * Три различимых состояния ошибки (§8.7) держатся на этой функции: только она
 * отличает «нет интернета» от «сервер недоступен». Ошибка здесь превращает два
 * разных сообщения в одно бесполезное «Ошибка».
 *
 * Правило вынесено в connectivity.ts без единого импорта — иначе тест тянул бы
 * нативный NetInfo, который в обычном Node не поднимается.
 */
const state = (
  isConnected: boolean | null,
  isInternetReachable: boolean | null,
): ConnectivitySnapshot => ({ isConnected, isInternetReachable });

describe('resolveConnectivity', () => {
  it('обычная рабочая сеть — онлайн', () => {
    expect(resolveConnectivity(state(true, true))).toBe(true);
  });

  it('интерфейса нет — офлайн', () => {
    expect(resolveConnectivity(state(false, false))).toBe(false);
  });

  /**
   * Главный случай ради которого функция и существует: школьный Wi-Fi, к
   * которому телефон подключён, но интернета за ним нет. По одному isConnected
   * это выглядит как рабочая сеть, и пользователь получил бы «сервер
   * недоступен» вместо честного «интернета нет, сообщение в очереди».
   */
  it('подключён к Wi-Fi, но интернета нет — офлайн', () => {
    expect(resolveConnectivity(state(true, false))).toBe(false);
  });

  /**
   * null означает «проверка ещё идёт». Объявлять офлайн в этот момент нельзя:
   * на холодном старте это дало бы ложное «интернета нет» на первом же запросе.
   */
  it('проверка достижимости ещё не завершена — считаем онлайн', () => {
    expect(resolveConnectivity(state(true, null))).toBe(true);
  });

  it('состояние интерфейса неизвестно, но интернет достижим — онлайн', () => {
    expect(resolveConnectivity(state(null, true))).toBe(true);
  });

  it('полностью неизвестное состояние не объявляется офлайном', () => {
    expect(resolveConnectivity(state(null, null))).toBe(true);
  });

  it('отсутствие интерфейса важнее «достижимости» — офлайн', () => {
    expect(resolveConnectivity(state(false, true))).toBe(false);
  });
});
