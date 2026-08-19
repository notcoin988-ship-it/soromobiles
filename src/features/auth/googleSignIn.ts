import Constants from 'expo-constants';
import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import * as WebBrowser from 'expo-web-browser';

import { GOOGLE_REDIRECT_URL, googleAuthUrl, parseGoogleRedirect } from './googleAuthLink';
import { themes, type ThemeName } from '../../design/tokens';

/**
 * Вход через Google: сначала нативное окно, при невозможности — браузер.
 *
 * ПОЧЕМУ ДВА ПУТИ, А НЕ ОДИН.
 *
 * Нативный (Credential Manager / Google Sign-In) показывает системный лист
 * выбора аккаунта поверх приложения — то самое «маленькое окно», к которому
 * человек привык в современных приложениях. Он же самый быстрый: аккаунт уже есть
 * на телефоне, пароль вводить не нужно. Но он работает ТОЛЬКО когда сходятся
 * три вещи: на устройстве есть сервисы Google, в Google Cloud Console заведён
 * OAuth-клиент типа Android с отпечатком SHA-1 нашей подписи, и приложение
 * подписано именно тем ключом. Иначе Google отвечает DEVELOPER_ERROR.
 *
 * Браузерный — то же, что на sorollm.tj: OAuth нашего сервера в Chrome Custom
 * Tabs (на iOS — ASWebAuthenticationSession, он показывается модально). Он не
 * требует НИЧЕГО в консоли, потому что идёт на web-клиенте сайта, и работает
 * даже там, где сервисов Google нет вовсе.
 *
 * Второй путь оставлен не «на всякий случай», а по делу: в Таджикистане
 * заметная доля телефонов Huawei без GMS, и для их владельцев нативное окно
 * не появится никогда. Плюс он же прикрывает время, пока запись в консоли не
 * заведена: приложение продолжает пускать людей, а не встречает их ошибкой.
 *
 * Наружу отдаётся РАЗНОЕ, и это не деталь реализации: нативный путь приносит
 * id_token, подписанный Google, браузерный — одноразовый код нашего сервера.
 * Обмениваются они на сессию разными эндпоинтами, поэтому тип различает их
 * явно, а не прячет за общей строкой.
 */

export type GoogleCredential =
  /** id_token от самого Google — сервер проверяет его подписью Google. */
  | { kind: 'idToken'; idToken: string }
  /** Одноразовый код нашего сервера из редиректа soro://auth/callback. */
  | { kind: 'code'; code: string };

export type GoogleSignInResult =
  | { ok: true; credential: GoogleCredential }
  /** Окно закрыли сами. Это не ошибка — показывать нечего. */
  | { ok: false; reason: 'cancelled' }
  | { ok: false; reason: 'failed' };

/**
 * Идентификатор web-клиента сайта. Не секрет (он виден в любом OAuth-запросе
 * с sorollm.tj), но и не константа в коде экрана: лежит в app.config.ts (§6.1).
 *
 * Именно web-, а не android-клиент: Google кладёт его в поле aud выданного
 * id_token, и по нему сервер понимает, что токен выпущен для нас. Android-
 * клиент при этом тоже нужен — но не здесь, а в консоли: он опознаёт
 * приложение по подписи.
 */
const WEB_CLIENT_ID = (Constants.expoConfig?.extra?.googleWebClientId as string | undefined) ?? '';

let configured = false;

function configureOnce(): boolean {
  if (!WEB_CLIENT_ID) return false;
  if (configured) return true;

  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    // offlineAccess даёт серверный authorization code для доступа к API Google
    // от имени человека. Нам этого не нужно — сервер только опознаёт, кто вошёл.
    offlineAccess: false,
  });
  configured = true;
  return true;
}

/**
 * Нативное окно. Возвращает null, когда путь недоступен в принципе, —
 * тогда вызывающий уходит в браузер. Отмену от недоступности отличаем: отмену
 * повторять браузером нельзя, иначе закрытое окно немедленно откроется снова.
 */
async function nativeSignIn(): Promise<GoogleSignInResult | null> {
  if (!configureOnce()) return null;

  try {
    // showPlayServicesUpdateDialog: false — предлагать обновить сервисы Google
    // посреди входа бессмысленно, для таких устройств есть браузерный путь.
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });

    /**
     * Выход перед входом. Без него система молча берёт аккаунт, которым
     * входили в прошлый раз, и человек, нажавший «войти» ради смены аккаунта,
     * получает тот же самый — без единого окна.
     */
    await GoogleSignin.signOut().catch(() => {});

    const response = await GoogleSignin.signIn();

    if (response.type === 'cancelled') return { ok: false, reason: 'cancelled' };

    const idToken = response.data.idToken;
    // Токена может не быть, если webClientId не совпал с тем, что в консоли.
    // Это ошибка настройки, а не устройства: пробуем браузер.
    return idToken ? { ok: true, credential: { kind: 'idToken', idToken } } : null;
  } catch (error) {
    if (isErrorWithCode(error)) {
      // Отмену системным жестом «назад» модуль отдаёт кодом, а не ответом.
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return { ok: false, reason: 'cancelled' };
      // Второе нажатие, пока окно уже открыто, — просто ждём первое.
      if (error.code === statusCodes.IN_PROGRESS) return { ok: false, reason: 'cancelled' };
    }
    /**
     * Всё остальное — недоступность нативного пути: нет сервисов Google
     * (Huawei и прочие без GMS), не заведён Android-клиент в консоли
     * (DEVELOPER_ERROR), приложение подписано другим ключом. Каждый из этих
     * случаев чинится браузером, поэтому здесь не ошибка, а null.
     */
    return null;
  }
}

/** Браузерный путь — тот же, что на сайте. */
async function browserSignIn(
  baseUrl: string,
  themeName: ThemeName,
): Promise<GoogleSignInResult> {
  const theme = themes[themeName];

  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(googleAuthUrl(baseUrl), GOOGLE_REDIRECT_URL, {
      // Панель браузера в цветах приложения — иначе поверх тёмной темы
      // распахивается белая полоса (как в openDocument).
      toolbarColor: theme.bg1,
      controlsColor: theme.text,
      // Куки браузера НЕ изолируются: именно в них лежит вход в Google,
      // ради которого человек и нажимает эту кнопку.
      preferEphemeralSession: false,
    });
  } catch {
    // Встроенного браузера на устройстве может не быть (урезанные прошивки).
    return { ok: false, reason: 'failed' };
  }

  // dismiss — закрыли крестиком, cancel — системной кнопкой «назад».
  if (result.type !== 'success') return { ok: false, reason: 'cancelled' };

  const redirect = parseGoogleRedirect(result.url);
  return redirect.ok
    ? { ok: true, credential: { kind: 'code', code: redirect.code } }
    : { ok: false, reason: 'failed' };
}

export async function startGoogleSignIn(
  baseUrl: string,
  themeName: ThemeName,
): Promise<GoogleSignInResult> {
  const native = await nativeSignIn();
  return native ?? browserSignIn(baseUrl, themeName);
}
