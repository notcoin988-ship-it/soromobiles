/**
 * Вычистка персональных данных из отчётов о сбоях (§13, §11).
 *
 * «Sentry — крэши и необработанные ошибки. Без PII: не отправлять текст
 * сообщений, почту, токены. Включён beforeSend-фильтр.»
 *
 * Это единственная защита от утечки переписки школьников во внешний сервис,
 * поэтому она сделана чистой функцией и покрыта тестами: подключать Sentry,
 * чтобы «на глаз» проверить, что именно уходит, — не вариант.
 *
 * Подход — «вырезать по образцу, а не надеяться на аккуратность»: текст
 * сообщений может оказаться в сообщении об ошибке, в теле запроса, в
 * заголовке, в URL и в произвольном contexts. Поэтому чистится всё дерево
 * события целиком, независимо от того, куда данные попали.
 */

/** Ключи, значение которых вырезается целиком, где бы они ни встретились. */
const SENSITIVE_KEYS = [
  'password',
  'access_token',
  'refresh_token',
  'authorization',
  'token',
  'email',
  'fullname',
  'content', // текст сообщения в чате
  'response', // текст ответа модели
  'messages',
  'question',
  'answer',
  'code', // код подтверждения из письма
  'client_msg_id',
  'cookie',
  'set-cookie',
];

export const REDACTED = '[вырезано]';

/** Почта в свободном тексте: «не удалось войти как user@mail.tj». */
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Bearer-токены и длинные ключи в свободном тексте. */
const BEARER_RE = /\bBearer\s+[\w\-._~+/]+=*/gi;
const LONG_SECRET_RE = /\b[A-Za-z0-9_-]{32,}\b/g;

/** Шестизначный код подтверждения рядом со словом code/код. */
const CODE_RE = /\b(code|код)\b\s*[:=]?\s*\d{6}\b/gi;

/**
 * Чистка свободного текста. Порядок важен: Bearer раньше общего правила на
 * длинные строки, иначе от токена останется слово Bearer и «вырезано», а по
 * длинному ключу правило уже не отработает.
 */
export function redactText(input: string): string {
  return input
    .replace(BEARER_RE, `Bearer ${REDACTED}`)
    .replace(CODE_RE, `code ${REDACTED}`)
    .replace(EMAIL_RE, REDACTED)
    .replace(LONG_SECRET_RE, REDACTED);
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEYS.some((k) => lower === k || lower.endsWith(`_${k}`));
}

/**
 * Рекурсивная чистка. Глубина ограничена: событие Sentry может содержать
 * циклические ссылки и очень глубокие деревья, а падать в beforeSend нельзя —
 * иначе не уйдёт вообще ни один отчёт.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;

  if (typeof value === 'string') return redactText(value);
  if (typeof value !== 'object' || value === null) return value;

  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactValue(item, depth + 1);
  }
  return out;
}

/**
 * Минимальная форма события Sentry — описано только то, что мы трогаем.
 * Полный тип брать не стали: он тянет типы SDK в модуль, который обязан
 * оставаться проверяемым в node.
 */
export type SentryLikeEvent = {
  message?: unknown;
  exception?: unknown;
  breadcrumbs?: unknown;
  request?: unknown;
  contexts?: unknown;
  extra?: unknown;
  tags?: unknown;
  user?: unknown;
  [key: string]: unknown;
};

/**
 * Фильтр beforeSend.
 *
 * Пользователь обнуляется целиком: §13 запрещает почту, а без неё поле
 * бесполезно. Идентификатор установки Sentry подставляет сам, и он анонимен.
 */
export function redactEvent(event: SentryLikeEvent): SentryLikeEvent {
  const cleaned = redactValue(event) as SentryLikeEvent;
  // user удаляем ПОСЛЕ общей чистки: там могли остаться поля вроде username.
  delete cleaned.user;
  return cleaned;
}
