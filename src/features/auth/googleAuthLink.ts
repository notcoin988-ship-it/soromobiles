/**
 * Браузерный вход через Google: сборка адресов и разбор ответов.
 *
 * Модуль намеренно чистый — ни expo-web-browser, ни стора, ни сети. Самое
 * ломкое в OAuth это склейка адреса и разбор того, что вернул браузер; такое
 * проверяется тестами, а не тыканьем в телефон.
 *
 * ЧЕМ ЭТОТ ПУТЬ ОТЛИЧАЕТСЯ ОТ ПРЕЖНЕГО. Раньше приложение открывало OAuth
 * НАШЕГО сервера (/auth/google), и сервер возвращал одноразовый код, который
 * менялся на сессию отдельной ручкой. От той ручки отказались: на бэкенде
 * держим ровно две. Поэтому теперь приложение говорит с Google напрямую —
 * весь обмен происходит внутри приложения, серверу достаётся только готовый
 * id_token, тот же самый, что приносит нативное окно.
 *
 * Отсюда и главное свойство: вход работает на телефонах БЕЗ сервисов Google
 * (Huawei и прочие без GMS) — нужен только браузер.
 */


/** Точки Google. Публичные и стабильные, менять их некому. */
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Куда Google возвращает человека: собственная схема клиента, «идентификатор
 * задом наперёд». Другого варианта у установленных приложений нет — https-
 * адрес Google для них не принимает, а localhost требует поднимать сервер
 * внутри приложения.
 *
 * ВАЖНО ПРО ANDROID: у клиентов типа Android приём собственной схемы по
 * умолчанию ВЫКЛЮЧЕН, и Google отвечает «Custom URI scheme is not enabled for
 * your Android client». Включается галочкой в консоли, в настройках клиента.
 */
export function reversedClientScheme(clientId: string): string {
  const bare = clientId.replace(/\.apps\.googleusercontent\.com$/, '');
  return `com.googleusercontent.apps.${bare}`;
}

export function redirectUriFor(clientId: string): string {
  return `${reversedClientScheme(clientId)}:/oauth2redirect`;
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

/**
 * PKCE (RFC 7636) — обязательная часть, а не украшение.
 *
 * У установленного приложения нет секрета: он лежал бы в APK и доставался бы
 * распаковкой за минуту. Поэтому Google принимает обмен кода на токен без
 * секрета, но требует доказательство, что код обменивает тот же, кто его
 * запрашивал: приложение придумывает случайный verifier, отправляет в запрос
 * его хеш (challenge), а при обмене — сам verifier. Перехваченный код без
 * verifier бесполезен.
 *
 * Сама генерация живёт в googleSignIn: ей нужен expo-crypto, то есть нативный
 * модуль, а этот файл намеренно остаётся без единой зависимости — иначе его
 * не прогнать быстрым набором тестов на node.
 */
export type Pkce = { verifier: string; challenge: string };

/** base64 → base64url: OAuth не принимает +, / и хвостовые =. */
export function base64url(value: string): string {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------------------------------------------------------------------------
// Адрес согласия
// ---------------------------------------------------------------------------

export function googleAuthUrl(params: {
  clientId: string;
  challenge: string;
  /** Против подмены ответа: сверяется при возврате. */
  state: string;
}): string {
  const query = new Map<string, string>([
    ['client_id', params.clientId],
    ['redirect_uri', redirectUriFor(params.clientId)],
    ['response_type', 'code'],
    // Больше не просим: нужны только «кто это» и как показать в интерфейсе.
    ['scope', 'openid email profile'],
    ['code_challenge', params.challenge],
    ['code_challenge_method', 'S256'],
    ['state', params.state],
    /**
     * select_account, а не consent: человек, у которого в браузере один
     * аккаунт, иначе не увидит выбора вовсе и войдёт «не тем», не поняв, что
     * произошло. Повторное согласие при этом не запрашивается.
     */
    ['prompt', 'select_account'],
  ]);

  const encoded = [...query]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');

  return `${AUTH_ENDPOINT}?${encoded}`;
}

// ---------------------------------------------------------------------------
// Разбор возврата
// ---------------------------------------------------------------------------

export type GoogleRedirect =
  | { ok: true; code: string }
  /** Человек отказал в доступе либо Google вернул ошибку. */
  | { ok: false; reason: 'denied' }
  /** Ответ не совпал с нашим state — подмена или чужой редирект. */
  | { ok: false; reason: 'state_mismatch' }
  /** Пришло что-то, чего мы не понимаем: ни кода, ни ошибки. */
  | { ok: false; reason: 'malformed' };

/**
 * Достаёт параметр из query. Своими руками, а не через URL/URLSearchParams:
 * в Hermes они реализованы не полностью, а на собственной схеме разбор и вовсе
 * расходится между платформами.
 */
function queryParam(url: string, name: string): string | null {
  if (!url.includes('?')) return null;
  const query = url.slice(url.indexOf('?') + 1).split('#')[0];

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

export function parseGoogleRedirect(url: string, expectedState: string): GoogleRedirect {
  // Ошибку проверяем ПЕРВОЙ: при отказе Google state возвращает, но кода нет,
  // и без этой ветки отказ выглядел бы как непонятный мусор.
  if (queryParam(url, 'error')) return { ok: false, reason: 'denied' };

  // Сверка state — защита от подсунутого ответа: чужая схема на Android может
  // быть зарегистрирована другим приложением.
  if (queryParam(url, 'state') !== expectedState) return { ok: false, reason: 'state_mismatch' };

  const code = queryParam(url, 'code');
  return code ? { ok: true, code } : { ok: false, reason: 'malformed' };
}

/** Тело обмена кода на токены. Форма, а не JSON: так требует Google. */
export function tokenRequestBody(params: {
  clientId: string;
  code: string;
  verifier: string;
}): string {
  const fields: Record<string, string> = {
    client_id: params.clientId,
    code: params.code,
    code_verifier: params.verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUriFor(params.clientId),
  };

  return Object.entries(fields)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}
