import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';

import {
  base64url,
  googleAuthUrl,
  parseGoogleRedirect,
  redirectUriFor,
  tokenRequestBody,
  TOKEN_ENDPOINT,
  type Pkce,
} from './googleAuthLink';
import { themes, type ThemeName } from '../../design/tokens';

/**
 * Вход через Google: сначала нативное окно, при невозможности — браузер.
 *
 * ОБА ПУТИ ЗАКАНЧИВАЮТСЯ ОДИНАКОВО — id_token, подписанным Google. Поэтому
 * серверу нужна ровно одна ручка (POST /v1/auth/google): ни таблиц, ни правок
 * в существующем коде сайта, ни отдельного обмена одноразовыми кодами.
 *
 * НАТИВНЫЙ ПУТЬ (Google Sign-In) показывает системное окно выбора аккаунта
 * поверх приложения: аккаунт уже на телефоне, пароль вводить не нужно.
 * Работает, только когда сходятся три вещи — есть сервисы Google, в консоли
 * заведён OAuth-клиент типа Android с отпечатком SHA-1 нашей подписи, и
 * приложение подписано именно тем ключом. Иначе DEVELOPER_ERROR.
 *
 * БРАУЗЕРНЫЙ ПУТЬ существует ради телефонов БЕЗ сервисов Google — Huawei и
 * прочих без GMS, а их в Таджикистане заметная доля. Для них нативного окна
 * не существует в принципе, и без этого пути они не вошли бы никогда.
 *
 * Весь его обмен происходит ВНУТРИ приложения: оно само говорит с Google по
 * PKCE и само меняет код на id_token. Наш сервер в этом не участвует — потому
 * серверных доработок под браузерный путь и нет.
 */

export type GoogleSignInResult =
  | { ok: true; idToken: string }
  /** Окно закрыли сами. Не ошибка — показывать нечего. */
  | { ok: false; reason: 'cancelled' }
  /** Ни сервисов Google, ни браузера — войти нечем. */
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'failed' };

const extra = Constants.expoConfig?.extra ?? {};

/**
 * Web-клиент. Нативному пути нужен как serverClientId: Google кладёт его в
 * aud выданного id_token, и по нему сервер узнаёт, что токен выпущен для нас.
 */
const WEB_CLIENT_ID = (extra.googleWebClientId as string | undefined) ?? '';

/** Клиент типа iOS: по нему опознают приложение и GIDSignIn, и браузер. */
const IOS_CLIENT_ID = (extra.googleIosClientId as string | undefined) ?? '';

/**
 * Клиент типа Android. Нативному пути не передаётся — там опознание идёт по
 * подписи APK, — но браузерному нужен: в адресе возврата стоит собственная
 * схема именно этого клиента.
 */
const ANDROID_CLIENT_ID = (extra.googleAndroidClientId as string | undefined) ?? '';

/** От чьего имени идёт браузерный обмен — зависит от платформы. */
const BROWSER_CLIENT_ID = Platform.OS === 'ios' ? IOS_CLIENT_ID : ANDROID_CLIENT_ID;

let configured = false;

function configureOnce(): boolean {
  if (!WEB_CLIENT_ID) return false;
  if (configured) return true;

  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    // Пустая строка на Android безвредна: поле там не читается.
    iosClientId: IOS_CLIENT_ID,
    // offlineAccess даёт серверный authorization code для доступа к API Google
    // от имени человека. Нам этого не нужно — сервер только опознаёт, кто вошёл.
    offlineAccess: false,
  });
  configured = true;
  return true;
}

/**
 * Нативное окно. Возвращает null, когда путь недоступен в принципе, — тогда
 * вызывающий уходит в браузер. Отмену от недоступности отличаем: отмену
 * повторять браузером нельзя, иначе закрытое окно немедленно откроется снова.
 */
async function nativeSignIn(): Promise<GoogleSignInResult | null> {
  if (!configureOnce()) return null;

  try {
    // showPlayServicesUpdateDialog: false — системное окно «обновите сервисы»
    // посреди входа обрывает сценарий; для таких телефонов есть браузер.
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
  } catch {
    return null;
  }

  try {
    /**
     * Выход перед входом. Без него система молча берёт аккаунт, которым
     * входили в прошлый раз, и человек, нажавший «войти» ради смены аккаунта,
     * получает тот же самый — без единого окна.
     */
    await GoogleSignin.signOut().catch(() => {});

    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') return { ok: false, reason: 'cancelled' };

    const idToken = response.data.idToken;
    // Токена нет, если webClientId разошёлся с заведённым в консоли. Это
    // ошибка настройки, а не устройства, — браузер её обойдёт.
    return idToken ? { ok: true, idToken } : null;
  } catch (error) {
    if (isErrorWithCode(error)) {
      // Отмену системным жестом «назад» модуль отдаёт кодом, а не ответом.
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, reason: 'cancelled' };
      // Второе нажатие, пока окно уже открыто, — просто ждём первое.
      if (error.code === statusCodes.IN_PROGRESS) return { ok: false, reason: 'cancelled' };
    }
    // DEVELOPER_ERROR, чужая подпись, сбой внутри GMS — всё чинится браузером.
    return null;
  }
}

/**
 * Пара PKCE. Живёт здесь, а не в googleAuthLink: нужен expo-crypto, а тот
 * файл намеренно без зависимостей, чтобы прогоняться быстрым набором тестов.
 */
async function createPkce(): Promise<Pkce> {
  // 32 байта энтропии — verifier выходит 43 символа, минимум по RFC.
  const bytes = await Crypto.getRandomBytesAsync(32);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const verifier = base64url(globalThis.btoa(binary));

  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });

  return { verifier, challenge: base64url(digest) };
}

/** Случайный state: 16 байт в hex. Сверяется при возврате из браузера. */
async function randomState(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Браузерный путь: PKCE напрямую с Google.
 *
 * openAuthSessionAsync, а не openBrowserAsync: он сам ловит редирект на нашу
 * схему, закрывает окно и отдаёт адрес обратно. С обычным браузером окно
 * осталось бы висеть поверх экрана после успешного входа.
 */
async function browserSignIn(themeName: ThemeName): Promise<GoogleSignInResult> {
  if (!BROWSER_CLIENT_ID) return { ok: false, reason: 'unavailable' };

  const theme = themes[themeName];
  const pkce = await createPkce();
  const state = await randomState();

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(
      googleAuthUrl({ clientId: BROWSER_CLIENT_ID, challenge: pkce.challenge, state }),
      redirectUriFor(BROWSER_CLIENT_ID),
      {
        // Панель браузера в цветах приложения — иначе поверх тёмной темы
        // распахивается белая полоса.
        toolbarColor: theme.bg1,
        controlsColor: theme.text,
        // Куки браузера НЕ изолируются: там уже может быть вход в Google.
        preferEphemeralSession: false,
      },
    );
  } catch {
    // Встроенного браузера может не быть вовсе (урезанные прошивки).
    return { ok: false, reason: 'unavailable' };
  }

  // dismiss — закрыли крестиком, cancel — системной кнопкой «назад».
  if (result.type !== 'success') return { ok: false, reason: 'cancelled' };

  const redirect = parseGoogleRedirect(result.url, state);
  if (!redirect.ok) {
    // Отказ на экране Google — то же, что закрыть окно: человек передумал.
    return { ok: false, reason: redirect.reason === 'denied' ? 'cancelled' : 'failed' };
  }

  /**
   * Обмен кода на токены — прямо с Google, минуя наш сервер. Секрет не нужен:
   * у установленного приложения его нет, вместо него PKCE-verifier.
   *
   * Голый fetch, а не наш ApiClient: тот добавляет Authorization, ретраи и
   * заголовки нашего API, которым на чужой ручке делать нечего.
   */
  try {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenRequestBody({
        clientId: BROWSER_CLIENT_ID,
        code: redirect.code,
        verifier: pkce.verifier,
      }),
    });

    if (!response.ok) return { ok: false, reason: 'failed' };

    const payload: unknown = await response.json();
    const idToken =
      typeof payload === 'object' && payload !== null
        ? (payload as { id_token?: unknown }).id_token
        : undefined;

    return typeof idToken === 'string' && idToken
      ? { ok: true, idToken }
      : { ok: false, reason: 'failed' };
  } catch {
    // Сеть отвалилась между согласием и обменом. Код уже потрачен, повторять
    // нечего — человеку придётся начать вход заново.
    return { ok: false, reason: 'failed' };
  }
}

export async function startGoogleSignIn(themeName: ThemeName): Promise<GoogleSignInResult> {
  const native = await nativeSignIn();
  return native ?? browserSignIn(themeName);
}
