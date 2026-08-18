import { describe, it } from 'node:test';

import { expect, fn } from '../../../test/expect';
import { TOKEN_FLUSH_INTERVAL_MS, TokenBuffer } from '../tokenBuffer';

/** Управляемый таймер: тест сам решает, когда «прошло» 50 мс. */
function fakeTimer() {
  let queued: (() => void) | null = null;
  return {
    setTimer: (fn: () => void) => {
      queued = fn;
      return 1;
    },
    clearTimer: () => {
      queued = null;
    },
    tick: () => {
      const fn = queued;
      queued = null;
      fn?.();
    },
    get isArmed() {
      return queued !== null;
    },
  };
}

describe('TokenBuffer', () => {
  it('интервал по умолчанию — 50 мс, как требует §5.4', () => {
    expect(TOKEN_FLUSH_INTERVAL_MS).toBe(50);
  });

  /**
   * Суть оптимизации: сто токенов не должны дать сто перерисовок.
   * На Redmi 9A именно это кладёт интерфейс (§12).
   */
  it('сто токенов дают один вызов onFlush, а не сто', () => {
    const onFlush = fn();
    const timer = fakeTimer();
    const buffer = new TokenBuffer({ onFlush, ...timer });

    for (let i = 0; i < 100; i += 1) buffer.push('а');
    expect(onFlush).not.toHaveBeenCalled(); // до тика — тишина

    timer.tick();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith('а'.repeat(100));
  });

  it('отдаёт полный текст, а не дельту', () => {
    const onFlush = fn();
    const timer = fakeTimer();
    const buffer = new TokenBuffer({ onFlush, ...timer });

    buffer.push('Сал');
    timer.tick();
    buffer.push('ом');
    timer.tick();

    expect(onFlush.mock.calls.map((c) => c[0])).toEqual(['Сал', 'Салом']);
  });

  it('не вооружает новый таймер, пока предыдущий не сработал', () => {
    const setTimer = fn(() => 1);
    const buffer = new TokenBuffer({ onFlush: () => {}, setTimer, clearTimer: () => {} });

    buffer.push('а');
    buffer.push('б');
    buffer.push('в');

    expect(setTimer).toHaveBeenCalledTimes(1);
  });

  it('flush() сбрасывает немедленно — это кнопка «Стоп»', () => {
    const onFlush = fn();
    const timer = fakeTimer();
    const buffer = new TokenBuffer({ onFlush, ...timer });

    buffer.push('час');
    buffer.flush();

    expect(onFlush).toHaveBeenCalledWith('час');
    expect(timer.isArmed).toBe(false); // таймер снят, лишнего вызова не будет
  });

  it('flush() без новых токенов не дёргает onFlush впустую', () => {
    const onFlush = fn();
    const timer = fakeTimer();
    const buffer = new TokenBuffer({ onFlush, ...timer });

    buffer.push('а');
    buffer.flush();
    buffer.flush();
    buffer.flush();

    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it('уже полученный текст остаётся доступен после close()', () => {
    const onFlush = fn();
    const timer = fakeTimer();
    const buffer = new TokenBuffer({ onFlush, ...timer });

    buffer.push('Тоҷикистон');
    buffer.close();

    expect(onFlush).toHaveBeenCalledWith('Тоҷикистон');
    expect(buffer.value).toBe('Тоҷикистон');
  });

  it('после close() новые токены игнорируются — стрим отменён', () => {
    const onFlush = fn();
    const timer = fakeTimer();
    const buffer = new TokenBuffer({ onFlush, ...timer });

    buffer.push('до');
    buffer.close();
    onFlush.mockClear();

    buffer.push('после');
    timer.tick();

    expect(buffer.value).toBe('до');
    expect(onFlush).not.toHaveBeenCalled();
  });

  it('не теряет ни одного символа при чередовании push и tick', () => {
    const seen: string[] = [];
    const timer = fakeTimer();
    const buffer = new TokenBuffer({ onFlush: (t) => seen.push(t), ...timer });

    const chunks = ['Ҳ', 'а', 'н', 'ӯ', 'з', ' ', 'ч', 'а', 'т', 'е'];
    chunks.forEach((c, i) => {
      buffer.push(c);
      if (i % 3 === 0) timer.tick();
    });
    buffer.flush();

    expect(seen.at(-1)).toBe('Ҳанӯз чате');
  });
});
