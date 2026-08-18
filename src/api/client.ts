/**
 * Базовый сетевой слой (§5.3).
 *
 * Принципы:
 *   • api/ ничего не знает про UI (§5.2) — наружу отдаются типизированные данные
 *     либо типизированные ошибки, без строк для пользователя;
 *   • ровно одна точка, где добавляется Authorization: Bearer;
 *   • fetch, хранилище токенов, часы и sleep инжектируются — иначе слой
 *     невозможно протестировать без Keychain, устройства и реального времени.
 *
 * Cookie-авторизация здесь не реализуется намеренно: §6.2 её прямо запрещает
 * для мобильного клиента, несмотря на то что живой веб-бэкенд работает именно
 * на 2-часовой cookie-сессии (B1).
 */

import { apiErrorFromResponse, type ApiError } from './errors';
import { rememberRequest, requestIdOf } from '../telemetry/requestLog';

export type ApiResult<T> =
  /**
   * status нужен вызывающему коду не для красоты: B8 (§6.6) требует отличать
   * 200 «ответ готов» от 202 «генерация ещё идёт». Оба успешные, но означают
   * противоположное, и без статуса 202 выглядит как пустой ответ модели.
   */
  { ok: true; data: T; status: number } | { ok: false; error: ApiError };

export type AuthTokens = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

/** Реализация поверх react-native-keychain живёт вне api/ (§11). */
export type TokenStore = {
  getAccess(): Promise<string | null>;
  getRefresh(): Promise<string | null>;
  save(tokens: AuthTokens): Promise<void>;
  clear(): Promise<void>;
};

export type ClientDeps = {
  /**
   * Строка либо функция. Функция нужна дев-режиму: он переключает адрес на
   * прод в рантайме, не пересобирая приложение.
   */
  baseUrl: string | (() => string);
  tokens: TokenStore;
  /** Полный логаут: чистим Keychain и уходим на экран входа. */
  onLogout: () => void;
  /** NetInfo.isConnected — чтобы отличать 'offline' от 'timeout' (§8.7). */
  isConnected: () => boolean;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Никаких console.* в релизе (§5.3) — логгер инжектируется и по умолчанию молчит. */
  log?: (message: string, meta?: unknown) => void;
};

export const TIMEOUT_FIRST_BYTE_MS = 20_000;
export const TIMEOUT_TOTAL_MS = 120_000;
/** 3 попытки с экспоненциальной паузой 1 → 3 → 7 с плюс jitter (§5.3). */
export const RETRY_DELAYS_MS = [1_000, 3_000, 7_000] as const;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Запрос без авторизации: /v1/auth/login, /register, /v1/config. */
  anonymous?: boolean;
  /**
   * Идемпотентен ли запрос. GET/PATCH/DELETE — да по природе. POST — только
   * если несёт client_msg_id (B8). POST /v2/ask без client_msg_id не
   * ретраится НИКОГДА: повтор спишет лимит и создаст дубль в истории.
   */
  idempotent?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Полный джиттер: пауза случайна в [0, base] — не синхронизирует всплеск ретраев. */
function jitter(baseMs: number): number {
  return Math.random() * baseMs;
}

export class ApiClient {
  private readonly deps: Required<Pick<ClientDeps, 'fetchImpl' | 'sleep' | 'log'>> & ClientDeps;
  /** Единственный рефреш на всё приложение. Остальные запросы ждут этот промис. */
  private refreshInFlight: Promise<boolean> | null = null;

  constructor(deps: ClientDeps) {
    this.deps = {
      ...deps,
      fetchImpl: deps.fetchImpl ?? globalThis.fetch.bind(globalThis),
      sleep: deps.sleep ?? defaultSleep,
      log: deps.log ?? (() => {}),
    };
  }

  get baseUrl(): string {
    const { baseUrl } = this.deps;
    return typeof baseUrl === 'function' ? baseUrl() : baseUrl;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const maxAttempts = options.idempotent ? RETRY_DELAYS_MS.length + 1 : 1;
    let lastError: ApiError = { kind: 'timeout' };

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) {
        await this.deps.sleep(jitter(RETRY_DELAYS_MS[attempt - 1]));
      }

      const result = await this.attempt<T>(path, options, false);
      if (result.ok) return result;

      lastError = result.error;
      if (!this.isRetryable(result.error)) return result;
    }

    return { ok: false, error: lastError };
  }

  /** Стоит ли повторять. 4xx кроме 429 повторять бессмысленно. */
  private isRetryable(error: ApiError): boolean {
    return error.kind === 'timeout' || error.kind === 'server' || error.kind === 'offline';
  }

  /**
   * Открывает поток (SSE) с тем же управлением авторизацией, что и request().
   * Тело НЕ вычитывается целиком — его читает вызывающий код по кускам.
   *
   * Возвращает сырой Response, чтобы транспорт (expo/fetch либо
   * react-native-sse) остался деталью слоя выше: §5.4 оставляет выбор
   * открытым, и он не должен протекать в client.ts.
   *
   * Отдельно отдаётся статус и разобранное тело для 409: на /v2/ask/stream это
   * NOT_STREAMABLE, и вызывающий обязан бесшовно уйти на /v2/ask (§5.4).
   */
  async openStream(
    path: string,
    body: unknown,
    options: { signal?: AbortSignal; isRetryAfterRefresh?: boolean } = {},
  ): Promise<
    | { ok: true; response: Response }
    | { ok: false; status: number; body: unknown; error: ApiError }
  > {
    if (!this.deps.isConnected()) {
      return { ok: false, status: 0, body: undefined, error: { kind: 'offline' } };
    }

    const access = await this.deps.tokens.getAccess();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      // Обязателен, иначе прокси может не распознать поток (§6.4).
      Accept: 'text/event-stream',
    };
    if (access) headers.Authorization = `Bearer ${access}`;

    try {
      const response = await this.deps.fetchImpl(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      });

      if (response.ok) return { ok: true, response };

      if (response.status === 401 && !options.isRetryAfterRefresh) {
        const refreshed = await this.ensureRefreshed();
        if (refreshed) {
          return this.openStream(path, body, { ...options, isRetryAfterRefresh: true });
        }
        this.deps.onLogout();
        return { ok: false, status: 401, body: undefined, error: { kind: 'unauthorized' } };
      }

      const parsed = safeJson(await response.text());
      return {
        ok: false,
        status: response.status,
        body: parsed,
        error: apiErrorFromResponse(response.status, parsed),
      };
    } catch (error) {
      this.deps.log('stream failed', error);
      const kind: ApiError = this.deps.isConnected() ? { kind: 'timeout' } : { kind: 'offline' };
      return { ok: false, status: 0, body: undefined, error: kind };
    }
  }

  private async attempt<T>(
    path: string,
    options: RequestOptions,
    isRetryAfterRefresh: boolean,
  ): Promise<ApiResult<T>> {
    if (!this.deps.isConnected()) return { ok: false, error: { kind: 'offline' } };

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    if (!options.anonymous) {
      const access = await this.deps.tokens.getAccess();
      // Единственное место во всём проекте, где ставится заголовок Authorization.
      if (access) headers.Authorization = `Bearer ${access}`;
    }

    const controller = new AbortController();
    const onOuterAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onOuterAbort);

    // Первый байт — 20 с. После получения заголовков лимит расширяется до 120 с
    // на чтение тела (§5.3).
    let timer = setTimeout(() => controller.abort(), TIMEOUT_FIRST_BYTE_MS);
    let timedOut = false;
    const markTimeout = () => {
      timedOut = true;
    };
    controller.signal.addEventListener('abort', markTimeout);

    try {
      const response = await this.deps.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_TOTAL_MS);

      const raw = await response.text();
      const parsed = raw ? safeJson(raw) : undefined;

      /**
       * §13: request_id из ответа кладём в кольцевой буфер — и при успехе, и
       * при ошибке. Именно по нему саппорт находит запрос в логах бэкенда,
       * а к моменту обращения интересен как раз предыдущий, удавшийся.
       *
       * В буфер попадают только идентификатор, путь и код: ни тела, ни
       * заголовков (§11).
       */
      const requestId = requestIdOf(parsed);
      if (requestId) {
        rememberRequest({ requestId, path, status: response.status, at: Date.now() });
      }

      if (response.ok) return { ok: true, data: parsed as T, status: response.status };

      if (response.status === 401 && !options.anonymous && !isRetryAfterRefresh) {
        const refreshed = await this.ensureRefreshed();
        if (refreshed) {
          // Повторяем ровно один раз, уже с новым access-токеном.
          return this.attempt<T>(path, options, true);
        }
        this.deps.onLogout();
        return { ok: false, error: { kind: 'unauthorized' } };
      }

      return { ok: false, error: apiErrorFromResponse(response.status, parsed) };
    } catch (error) {
      // Отмена извне (кнопка «Стоп») — не таймаут, пробрасываем как timeout
      // только если аборт наш.
      if (timedOut) return { ok: false, error: { kind: 'timeout' } };
      if (options.signal?.aborted) return { ok: false, error: { kind: 'timeout' } };
      this.deps.log('network error', error);
      // fetch падает и когда сеть исчезла между проверкой isConnected и запросом.
      return { ok: false, error: this.deps.isConnected() ? { kind: 'timeout' } : { kind: 'offline' } };
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', markTimeout);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  /**
   * Рефреш под мьютексом: сколько бы запросов ни получили 401 одновременно,
   * на /v1/auth/refresh уйдёт ровно один запрос, остальные дождутся его
   * результата. Без этого пачка параллельных 401 сожжёт цепочку ротации
   * refresh-токена и выкинет живого пользователя на экран входа.
   */
  private ensureRefreshed(): Promise<boolean> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<boolean> {
    const refresh = await this.deps.tokens.getRefresh();
    if (!refresh) return false;

    try {
      const response = await this.deps.fetchImpl(`${this.baseUrl}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });

      if (!response.ok) {
        await this.deps.tokens.clear();
        return false;
      }

      const tokens = safeJson(await response.text()) as AuthTokens | undefined;
      if (!tokens?.access_token || !tokens?.refresh_token) {
        await this.deps.tokens.clear();
        return false;
      }

      // refresh_token ротируется при каждом использовании (§6.2) — сохраняем новый.
      await this.deps.tokens.save(tokens);
      return true;
    } catch (error) {
      this.deps.log('refresh failed', error);
      return false;
    }
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Сервер под нагрузкой умеет отдавать HTML вместо JSON — это не повод падать.
    return undefined;
  }
}
