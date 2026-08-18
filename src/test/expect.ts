import assert from 'node:assert/strict';

/**
 * Минимальный слой matcher'ов поверх node:assert для встроенного раннера Node.
 *
 * Почему не vitest, как задумывалось в плане: vitest тянет vite → rolldown →
 * платформенный нативный бинарник, а npm на этой машине стабильно роняет
 * установку optional-зависимостей (ECONNRESET с откатом всего дерева). Node 24
 * умеет исполнять TypeScript напрямую и содержит раннер в себе, поэтому тесты
 * работают вообще без зависимостей.
 *
 * Покрыто ровно то, что используется в тестах, — не больше. Вся фактическая
 * проверка делегируется node:assert, здесь только фасад.
 */

// any здесь намеренно: с unknown-параметрами generic-ограничение ломается на
// контравариантности — функция с конкретными типами аргументов в него не влезает.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

export type Spy<F extends AnyFn = AnyFn> = F & {
  mock: { calls: Parameters<F>[] };
  mockClear: () => void;
  mockReturnValue: (value: ReturnType<F>) => Spy<F>;
};

/** Аналог vi.fn(): запоминает вызовы. */
export function fn<F extends AnyFn>(impl?: F): Spy<F> {
  let implementation = impl;
  const calls: Parameters<F>[] = [];

  const spy = ((...args: Parameters<F>) => {
    calls.push(args);
    return implementation?.(...args);
  }) as Spy<F>;

  spy.mock = { calls };
  spy.mockClear = () => {
    calls.length = 0;
  };
  spy.mockReturnValue = (value: ReturnType<F>) => {
    implementation = (() => value) as unknown as F;
    return spy;
  };

  return spy;
}

function isSpy(value: unknown): value is Spy {
  return typeof value === 'function' && 'mock' in (value as object);
}

/** Проверяет, что actual содержит все поля expected (рекурсивно). */
function matchesSubset(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return Object.is(actual, expected);
  if (actual === null || typeof actual !== 'object') return false;

  for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
    if (!matchesSubset((actual as Record<string, unknown>)[key], value)) return false;
  }
  return true;
}

function describeValue(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

class Matchers {
  constructor(
    private readonly actual: unknown,
    private readonly label: string | undefined,
    private readonly negated: boolean,
  ) {}

  private assert(passed: boolean, message: string): void {
    const ok = this.negated ? !passed : passed;
    if (!ok) {
      const prefix = this.label ? `${this.label}: ` : '';
      assert.fail(`${prefix}${this.negated ? 'НЕ ожидалось, но ' : ''}${message}`);
    }
  }

  get not(): Matchers {
    return new Matchers(this.actual, this.label, !this.negated);
  }

  toBe(expected: unknown): void {
    this.assert(
      Object.is(this.actual, expected),
      `ожидалось ${describeValue(expected)}, получено ${describeValue(this.actual)}`,
    );
  }

  toEqual(expected: unknown): void {
    let passed = true;
    try {
      assert.deepStrictEqual(this.actual, expected);
    } catch {
      passed = false;
    }
    this.assert(
      passed,
      `глубокое равенство не выполнено.\n  ожидалось: ${describeValue(expected)}\n  получено:  ${describeValue(this.actual)}`,
    );
  }

  toMatchObject(expected: unknown): void {
    this.assert(
      matchesSubset(this.actual, expected),
      `объект не содержит ожидаемые поля.\n  ожидалось: ${describeValue(expected)}\n  получено:  ${describeValue(this.actual)}`,
    );
  }

  toHaveLength(expected: number): void {
    const actualLength = (this.actual as { length?: number })?.length;
    this.assert(actualLength === expected, `длина ${actualLength}, ожидалась ${expected}`);
  }

  toBeNull(): void {
    this.assert(this.actual === null, `значение ${describeValue(this.actual)}, ожидался null`);
  }

  toBeUndefined(): void {
    this.assert(
      this.actual === undefined,
      `значение ${describeValue(this.actual)}, ожидался undefined`,
    );
  }

  toThrow(): void {
    let threw = false;
    try {
      (this.actual as AnyFn)();
    } catch {
      threw = true;
    }
    this.assert(threw, 'функция должна была бросить исключение');
  }

  toHaveBeenCalled(): void {
    const spy = this.actual;
    if (!isSpy(spy)) return this.assert(false, 'значение не является шпионом fn()');
    this.assert(spy.mock.calls.length > 0, 'шпион не вызывался');
  }

  toHaveBeenCalledTimes(expected: number): void {
    const spy = this.actual;
    if (!isSpy(spy)) return this.assert(false, 'значение не является шпионом fn()');
    this.assert(
      spy.mock.calls.length === expected,
      `шпион вызван ${spy.mock.calls.length} раз(а), ожидалось ${expected}`,
    );
  }

  toHaveBeenCalledWith(...expected: unknown[]): void {
    const spy = this.actual;
    if (!isSpy(spy)) return this.assert(false, 'значение не является шпионом fn()');
    const found = spy.mock.calls.some((call) => {
      try {
        assert.deepStrictEqual(call, expected);
        return true;
      } catch {
        return false;
      }
    });
    this.assert(
      found,
      `шпион не вызывался с ${describeValue(expected)}. Фактические вызовы: ${describeValue(spy.mock.calls)}`,
    );
  }
}

export function expect(actual: unknown, label?: string): Matchers {
  return new Matchers(actual, label, false);
}
