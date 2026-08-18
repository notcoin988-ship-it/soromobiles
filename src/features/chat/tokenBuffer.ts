/**
 * Буфер токенов стрима (§5.4, §8.3, §12).
 *
 * Зачем: сервер шлёт токены по одному, и вызывать setState на каждый — верный
 * способ положить интерфейс на дешёвом Android. ТЗ требует копить токены и
 * применять к состоянию батчами примерно раз в 50 мс.
 *
 * Таймер инжектируется, чтобы тесты не зависели от реального времени.
 */

export const TOKEN_FLUSH_INTERVAL_MS = 50;

export type TokenBufferOptions = {
  intervalMs?: number;
  /** Вызывается с ПОЛНЫМ накопленным текстом, а не с дельтой. */
  onFlush: (fullText: string) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export class TokenBuffer {
  private text = '';
  private pending = false;
  private handle: unknown = null;
  private closed = false;

  private readonly intervalMs: number;
  private readonly onFlush: (fullText: string) => void;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(options: TokenBufferOptions) {
    this.intervalMs = options.intervalMs ?? TOKEN_FLUSH_INTERVAL_MS;
    this.onFlush = options.onFlush;
    this.setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer =
      options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  /** Полный текст, накопленный на данный момент, включая ещё не сброшенное. */
  get value(): string {
    return this.text;
  }

  push(chunk: string): void {
    if (this.closed) return;
    this.text += chunk;
    this.pending = true;
    if (this.handle === null) {
      this.handle = this.setTimer(() => {
        this.handle = null;
        this.emit();
      }, this.intervalMs);
    }
  }

  /**
   * Немедленный сброс — на событие done либо на кнопку «Стоп»: уже полученный
   * текст обязан остаться в чате (§5.4).
   */
  flush(): void {
    if (this.handle !== null) {
      this.clearTimer(this.handle);
      this.handle = null;
    }
    this.emit();
  }

  /** Завершает буфер: сбрасывает остаток и перестаёт принимать токены. */
  close(): void {
    this.flush();
    this.closed = true;
  }

  private emit(): void {
    if (!this.pending) return;
    this.pending = false;
    this.onFlush(this.text);
  }
}
