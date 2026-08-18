/**
 * Обезличенные счётчики событий (§13).
 *
 * «Продуктовая аналитика в v1.0 — минимальная, только обезличенные счётчики
 * событий на собственном бэкенде: app_open, signup_started, signup_completed,
 * first_message_sent, message_sent, error_shown с типом. Никаких сторонних
 * трекеров.»
 *
 * Список закрытый и лежит здесь целиком: тип не даст отправить событие,
 * которого нет в ТЗ. Это защита не от опечатки, а от разрастания — «давайте
 * ещё померим, что человек написал» начинается именно с произвольной строки
 * в имени события.
 *
 * Полезная нагрузка — тоже закрытый список: у error_shown это ВИД ошибки, а
 * не её текст и не то, что человек делал.
 */

export const EVENT_NAMES = [
  'app_open',
  'signup_started',
  'signup_completed',
  'first_message_sent',
  'message_sent',
  'error_shown',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Вид ошибки — ровно тот же набор, что и в ApiError (§5.3). */
export type ErrorKind =
  | 'offline'
  | 'timeout'
  | 'server'
  | 'unauthorized'
  | 'limit'
  | 'validation'
  | 'unknown';

export type AnalyticsEvent =
  | { name: Exclude<EventName, 'error_shown'> }
  | { name: 'error_shown'; kind: ErrorKind };

/**
 * Тело запроса к собственному бэкенду. Ни идентификатора устройства, ни
 * рекламного идентификатора, ни почты: §13 требует «обезличенные», а §4.3
 * прямо запрещает аналитику с идентификацией устройства.
 */
export type EventPayload = {
  name: EventName;
  /** Только для error_shown. */
  kind?: ErrorKind;
  /** Момент события на устройстве — чтобы порядок не зависел от сети. */
  at: string;
};

export function toPayload(event: AnalyticsEvent, now: Date = new Date()): EventPayload {
  return {
    name: event.name,
    ...('kind' in event ? { kind: event.kind } : {}),
    at: now.toISOString(),
  };
}

/**
 * Отправка. Инжектируется снаружи, чтобы модуль оставался проверяемым и не
 * знал ни про сеть, ни про адрес бэкенда.
 */
export type EventSink = (payload: EventPayload) => void;

let sink: EventSink | null = null;
/** События до инициализации не теряются: app_open случается раньше неё. */
let pending: EventPayload[] = [];
const PENDING_LIMIT = 20;

export function setEventSink(next: EventSink | null): void {
  sink = next;
  if (!sink) return;

  const queued = pending;
  pending = [];
  for (const payload of queued) sink(payload);
}

/**
 * Отправить событие. Никогда не бросает и ничего не возвращает: аналитика не
 * имеет права влиять на работу продукта — ни задержкой, ни ошибкой.
 */
export function track(event: AnalyticsEvent): void {
  const payload = toPayload(event);

  if (!sink) {
    if (pending.length < PENDING_LIMIT) pending.push(payload);
    return;
  }

  try {
    sink(payload);
  } catch {
    // Счётчик потерян — это допустимо. Уронить из-за него экран нельзя.
  }
}

/** Только для тестов. */
export function resetEvents(): void {
  sink = null;
  pending = [];
}

export function pendingCount(): number {
  return pending.length;
}
