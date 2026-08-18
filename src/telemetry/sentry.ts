import * as Sentry from '@sentry/react-native';

import { redactEvent, type SentryLikeEvent } from './redact';

/**
 * Подключение Sentry (§4.2, §13).
 *
 * «Sentry — крэши и необработанные ошибки. Без PII: не отправлять текст
 * сообщений, почту, токены. Включён beforeSend-фильтр.»
 *
 * DSN берётся из окружения и НЕ хардкодится. Если его нет — Sentry не
 * поднимается вовсе: молча слать отчёты в чужой проект хуже, чем не слать их
 * совсем. Отсутствие DSN — нормальное состояние на этапе разработки.
 */

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

let started = false;

export function initSentry(): void {
  if (started || DSN.length === 0) return;
  started = true;

  Sentry.init({
    dsn: DSN,

    /**
     * Главный выключатель PII на стороне SDK: без него Sentry сам подставляет
     * IP-адрес и данные пользователя. Наш beforeSend — второй рубеж, а не
     * единственный.
     */
    sendDefaultPii: false,

    /**
     * Хлебные крошки отключены целиком.
     *
     * Автоматические крошки записывают нажатия, переходы и — главное — тела
     * сетевых запросов. То есть вопрос школьника уехал бы в Sentry даже при
     * идеальном beforeSend для самого события. Дешевле не собирать их вовсе,
     * чем вычищать.
     */
    maxBreadcrumbs: 0,
    enableAutoPerformanceTracing: false,

    // Профилирование и трассировка не нужны: §13 просит крэши, не метрики.
    tracesSampleRate: 0,

    beforeSend(event) {
      try {
        // Через unknown: тип события SDK и наша минимальная форма намеренно
        // не совпадают — redact.ts обязан остаться проверяемым в node и не
        // тянуть типы Sentry.
        return redactEvent(event as unknown as SentryLikeEvent) as unknown as typeof event;
      } catch {
        // Фильтр сломался — значит содержимое события неизвестно. Не
        // отправляем ничего: пустой отчёт лучше утечки.
        return null;
      }
    },

    /** То же самое для крошек, если их когда-нибудь включат обратно. */
    beforeBreadcrumb() {
      return null;
    },
  });
}

/**
 * Ручная отправка пойманной ошибки. Текст сообщения и почту сюда передавать
 * нельзя — beforeSend их вырежет, но полагаться на это как на единственную
 * защиту не стоит.
 */
export function captureError(error: unknown, tags?: Record<string, string>): void {
  if (!started) return;
  Sentry.captureException(error, tags ? { tags } : undefined);
}
