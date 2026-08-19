/**
 * Ссылки OAuth-обмена с бэкендом: сборка адреса и разбор редиректа.
 *
 * Модуль намеренно чистый — ни expo-web-browser, ни стора. Вся неудобная
 * часть входа через Google это разбор того, что вернул браузер, и проверить
 * её надо тестами, а не на устройстве.
 */

/**
 * Куда бэкенд возвращает человека после Google.
 *
 * Схема soro:// зарегистрирована в app.config.ts (§5.1). Адрес обязан
 * совпадать с тем, что прописан в конфиге сервера: сервер редиректит только
 * на известные ему адреса, произвольный redirect_uri из запроса он не берёт —
 * иначе это открытый редирект, через который угоняют коды авторизации.
 */
export const GOOGLE_REDIRECT_URL = 'soro://auth/callback';

/**
 * platform=mobile бэкенд запоминает в своей сессии до похода в Google и
 * смотрит на него в /auth/callback: вебу отдаётся cookie и HTML, приложению —
 * редирект на схему с одноразовым кодом. Значение ios на живом сервере уже
 * занято старым сценарием, поэтому у нас своё.
 */
export function googleAuthUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/auth/google?platform=mobile`;
}

export type GoogleRedirect =
  | { ok: true; code: string }
  /** Человек отказал в доступе на стороне Google либо сервер вернул ошибку. */
  | { ok: false; reason: 'denied' }
  /** Пришло что-то, чего мы не понимаем: ни кода, ни ошибки. */
  | { ok: false; reason: 'malformed' };

/**
 * Достаёт параметр из query. Своими руками, а не через URL/URLSearchParams:
 * в Hermes они реализованы не полностью, а на кастомной схеме soro:// разбор
 * и вовсе расходится между платформами. Здесь нужен ровно один параметр.
 */
function queryParam(url: string, name: string): string | null {
  const query = url.slice(url.indexOf('?') + 1).split('#')[0];
  if (!url.includes('?')) return null;

  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    const key = eq === -1 ? pair : pair.slice(0, eq);
    if (key !== name) continue;

    const raw = eq === -1 ? '' : pair.slice(eq + 1);
    try {
      return decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
      // Битая escape-последовательность — считаем, что параметра нет.
      return null;
    }
  }
  return null;
}

/**
 * Разбирает адрес, на который бэкенд вернул человека.
 *
 * Успех — soro://auth/callback?code=…; отказ — ?error=access_denied. Пустой
 * code приравнивается к отсутствию: сервер такого не пришлёт, но пришедший
 * пустым он тихо провалил бы обмен с невнятной ошибкой.
 */
export function parseGoogleRedirect(url: string): GoogleRedirect {
  const code = queryParam(url, 'code');
  if (code) return { ok: true, code };

  return queryParam(url, 'error') ? { ok: false, reason: 'denied' } : { ok: false, reason: 'malformed' };
}
