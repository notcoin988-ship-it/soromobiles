/**
 * Типизированные ошибки сетевого слоя (§5.3).
 *
 * api/ ничего не знает про UI (§5.2): здесь нет ни одной строки для показа
 * пользователю — только машинные признаки. Текст выбирает UI по i18n-ключу.
 */

export type ApiError =
  /** Нет сети (NetInfo.isConnected === false либо сетевой сбой fetch). */
  | { kind: 'offline' }
  /** Медленно / таймаут: 20 с на первый байт, 120 с на полный ответ. */
  | { kind: 'timeout' }
  /** 5xx, сервер недоступен. */
  | { kind: 'server'; status: number; requestId: string | null }
  /** 401 → попытка рефреша, при провале — логаут. */
  | { kind: 'unauthorized' }
  /** 429 — дневной лимит (§6.3.4, §8.6). */
  | {
      kind: 'limit';
      /** Уже локализован сервером на таджикском. Для ru/en UI переводит сам. */
      message: string;
      resetsInHours: number | null;
      resetsAtLocal: string | null;
      tier: string | null;
    }
  /**
   * Прочие клиентские ошибки: 403, 404, 409, 413, 422.
   * §5.3 задаёт union из шести вариантов, поэтому все они складываются сюда,
   * а различаются по полю status — см. §6.5.
   */
  | { kind: 'validation'; status: number; message: string };

/** Тело ошибки FastAPI: detail — либо строка, либо объект. */
type ErrorBody = {
  detail?:
    | string
    | {
        message?: string;
        profile?: string;
        request_id?: string;
        resets_at?: string;
        resets_at_local?: string;
        resets_in_hours?: number;
        tier?: string;
        code?: string;
      };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Достаёт человекочитаемое сообщение из detail, не падая на любой форме тела. */
function detailMessage(body: unknown): string {
  if (!isRecord(body)) return '';
  const { detail } = body as ErrorBody;
  if (typeof detail === 'string') return detail;
  if (isRecord(detail) && typeof detail.message === 'string') return detail.message;
  return '';
}

function detailField<T>(body: unknown, key: string, guard: (v: unknown) => v is T): T | null {
  if (!isRecord(body)) return null;
  const { detail } = body as { detail?: unknown };
  if (!isRecord(detail)) return null;
  const value = detail[key];
  return guard(value) ? value : null;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * HTTP-статус + разобранное тело → ApiError, по таблице §6.5.
 *
 * `body` может быть чем угодно, включая undefined: сервер под нагрузкой умеет
 * отдавать HTML или пустой ответ вместо JSON, и это не должно ломать клиент.
 */
export function apiErrorFromResponse(statusCode: number, body: unknown): ApiError {
  if (statusCode === 401) return { kind: 'unauthorized' };

  if (statusCode === 429) {
    return {
      kind: 'limit',
      message: detailMessage(body),
      resetsInHours: detailField(body, 'resets_in_hours', isNum),
      resetsAtLocal: detailField(body, 'resets_at_local', isStr),
      tier: detailField(body, 'tier', isStr),
    };
  }

  if (statusCode >= 500) {
    return {
      kind: 'server',
      status: statusCode,
      requestId: detailField(body, 'request_id', isStr),
    };
  }

  return { kind: 'validation', status: statusCode, message: detailMessage(body) };
}

/**
 * 409 NOT_STREAMABLE на /v2/ask/stream: профиль base требует полного ответа для
 * fact-check (§6.4, B9). Клиент обязан бесшовно повторить тот же запрос на
 * /v2/ask — без уведомления пользователя (§5.4).
 */
export function isNotStreamable(statusCode: number, body: unknown): boolean {
  return statusCode === 409 && detailField(body, 'profile', isStr) !== null;
}

/** Код ошибки для форм авторизации: email_taken, bad_credentials и т.п. (§6.6). */
export function authErrorCode(body: unknown): string | null {
  return detailField(body, 'code', isStr);
}

/** Ошибку стоит отправить в Sentry? 422 — баг клиента, его логируем (§6.5). */
export function shouldReportToSentry(error: ApiError): boolean {
  if (error.kind === 'validation') return error.status === 422;
  return error.kind === 'server';
}

/** i18n-ключ для показа пользователю. Единственный мост из api/ в тексты UI. */
export function messageKeyFor(error: ApiError): string {
  switch (error.kind) {
    case 'offline':
      return 'errors.offline';
    case 'timeout':
      return 'errors.slow';
    case 'server':
      return 'errors.serverDown';
    case 'unauthorized':
      return 'errors.needSignIn';
    case 'limit':
      return 'errors.limitReached';
    case 'validation':
      return error.status === 403 ? 'errors.accessDenied' : 'errors.genericError';
  }
}
