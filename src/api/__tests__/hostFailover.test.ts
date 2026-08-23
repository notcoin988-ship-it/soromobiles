import { describe, it } from 'node:test';

import { expect } from '../../test/expect';
import {
  FAILURES_BEFORE_SWITCH,
  INITIAL_STATE,
  initialActive,
  mirrorOf,
  MIRROR_TTL_MS,
  nextState,
  type FailoverState,
} from '../hostFailover';

/**
 * Правило существует ради конкретной аварии: 23.08.2026 перестала резолвиться
 * зона sorollm.tj, а сервер был жив под именем sorollm.ai. Тесты закрепляют то,
 * что тогда сломалось бы при небрежной реализации: прыжки между доменами на
 * каждом чихе мобильной сети и вечное залипание на зеркале.
 */

const unreachableTwice = (from: FailoverState = INITIAL_STATE): FailoverState =>
  nextState(nextState(from, 'unreachable'), 'unreachable');

describe('выбор адреса сервера', () => {
  it('одной неудачи мало — адрес не меняется', () => {
    const after = nextState(INITIAL_STATE, 'unreachable');
    expect(after.active).toBe('primary');
    expect(after.failures).toBe(1);
  });

  it('две подряд — уходим на зеркало', () => {
    expect(unreachableTwice().active).toBe('mirror');
  });

  it('порог ровно такой, как объявлен', () => {
    let state = INITIAL_STATE;
    for (let i = 0; i < FAILURES_BEFORE_SWITCH; i += 1) state = nextState(state, 'unreachable');
    expect(state.active).toBe('mirror');
  });

  it('успех между неудачами обнуляет счётчик — чередование не переключает', () => {
    let state = nextState(INITIAL_STATE, 'unreachable');
    state = nextState(state, 'reachable');
    state = nextState(state, 'unreachable');
    expect(state.active).toBe('primary');
  });

  it('успех на рабочем адресе ничего не двигает', () => {
    const state = nextState(INITIAL_STATE, 'reachable');
    expect(state.active).toBe('primary');
    expect(state.failures).toBe(0);
  });

  it('зеркало тоже не вечно: две неудачи — возвращаемся на основной', () => {
    const onMirror = unreachableTwice();
    expect(unreachableTwice(onMirror).active).toBe('primary');
  });

  it('после переключения счётчик обнулён — иначе следующая неудача швырнёт обратно', () => {
    expect(unreachableTwice().failures).toBe(0);
  });
});

describe('с какого адреса начинать после запуска', () => {
  const now = 1_800_000_000_000;

  it('без записи — с основного', () => {
    expect(initialActive(null, now)).toBe('primary');
  });

  it('свежая запись про зеркало — начинаем с зеркала', () => {
    expect(initialActive({ active: 'mirror', at: now - 60_000 }, now)).toBe('mirror');
  });

  it('запись старше суток — снова пробуем основной', () => {
    expect(initialActive({ active: 'mirror', at: now - MIRROR_TTL_MS - 1 }, now)).toBe('primary');
  });

  it('запись про основной адрес ничего не меняет', () => {
    expect(initialActive({ active: 'primary', at: now }, now)).toBe('primary');
  });
});

describe('запасное имя по основному', () => {
  it('tj → ai', () => {
    expect(mirrorOf('https://api.sorollm.tj')).toBe('https://api.sorollm.ai');
  });

  it('ai → tj', () => {
    expect(mirrorOf('https://api.sorollm.ai')).toBe('https://api.sorollm.tj');
  });

  it('у localhost пары нет — механизм выключается сам', () => {
    expect(mirrorOf('http://localhost:8787')).toBe(null);
  });
});
