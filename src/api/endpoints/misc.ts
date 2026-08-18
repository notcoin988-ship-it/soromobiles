import type { EventPayload } from '../../telemetry/events';
import type { ApiClient, ApiResult } from '../client';
import { FALLBACK_CONFIG, type ClientConfig, type Usage } from '../types';

/** Конфигурация клиента, лимиты, обратная связь, поддержка. */

/**
 * B6 — /v1/config. Запрашивается при каждом холодном старте, кэшируется на
 * 24 часа, при недоступности используется зашитый набор (§6.6).
 *
 * Никогда не возвращает ошибку: без конфига приложение обязано работать,
 * иначе недоступность одной ручки блокирует вход в продукт.
 */
export async function fetchConfig(
  client: ApiClient,
  params: { platform: 'ios' | 'android'; version: string; lang: string },
): Promise<ClientConfig> {
  const query = `platform=${params.platform}&version=${params.version}&lang=${params.lang}`;
  const result = await client.request<ClientConfig>(`/v1/config?${query}`, {
    anonymous: true,
    idempotent: true,
  });
  return result.ok ? { ...FALLBACK_CONFIG, ...result.data } : FALLBACK_CONFIG;
}

/** Нужно ли показать блокирующий экран обновления (§6.6). */
export function needsForcedUpdate(config: ClientConfig, currentVersion: string): boolean {
  if (config.force_update) return true;
  return compareVersions(currentVersion, config.min_supported_version) < 0;
}

/** Сравнение semver-подобных строк. -1 если a старше b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Обезличенный счётчик события (§13).
 *
 * Ручки на бэкенде пока нет — она появится вместе с остальными задачами B.
 * До тех пор запрос уходит и получает 404; это намеренно: результат не
 * проверяется, ошибка не показывается, повторов нет. Аналитика не имеет права
 * влиять на работу продукта, поэтому здесь нет ни ретраев, ни очереди.
 */
export async function sendEvent(client: ApiClient, payload: EventPayload): Promise<void> {
  await client.request('/v1/events', { method: 'POST', body: payload });
}

export function fetchUsage(client: ApiClient): Promise<ApiResult<Usage>> {
  return client.request<Usage>('/v1/usage', { idempotent: true });
}

export function contactSupport(
  client: ApiClient,
  body: { question: string; contact: string; context: string },
): Promise<ApiResult<unknown>> {
  return client.request('/v1/support/ask', { method: 'POST', body });
}
