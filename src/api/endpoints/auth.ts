import type { ApiClient, ApiResult } from '../client';
import type { AuthSession, User } from '../types';

/**
 * Авторизация через Google (§6.6 в редакции после отказа от почты и пароля).
 *
 * Вход в приложении ровно один — тот же, что на sorollm.tj: OAuth-редирект
 * бэкенда на Google. Регистрации по почте с 6-значным кодом из письма БОЛЬШЕ
 * НЕТ: ни /v1/auth/register, ни /verify, ни /resend, ни восстановления пароля.
 * Вместе с ними ушла и вся зависимость от SMTP.
 *
 * Как устроен обмен (подробности — docs/backend-reference/router_auth_google.py):
 *   1. приложение открывает во встроенном браузере GET /auth/google?platform=mobile;
 *   2. бэкенд ведёт человека на Google и принимает /auth/callback;
 *   3. увидев platform=mobile, бэкенд редиректит на soro://auth/callback?code=…
 *      с ОДНОРАЗОВЫМ кодом, живущим минуты;
 *   4. приложение меняет код на пару JWT здесь, в exchangeGoogleCode.
 *
 * Почему не cookie, как в вебе: §6.2 запрещает cookie-сессию мобильному
 * клиенту. Одноразовый код нужен по той же причине — токены нельзя отдавать
 * прямо в query редиректа, они осели бы в истории браузера и в логах.
 *
 * Чего здесь нет намеренно (§8.2 в новой редакции): гостевого режима и входа
 * по номеру телефона. Sign in with Apple не сделан осознанно — он обязателен
 * по Guideline 4.8 только для релиза в App Store, а первым выходит Android.
 */

/**
 * Меняет одноразовый код из редиректа на сессию.
 *
 * anonymous: токенов на этот момент ещё нет. Не идемпотентен: код одноразовый,
 * повторный запрос с тем же кодом сервер обязан отвергнуть, и ретраить его
 * бессмысленно — второй раз он уже не сработает.
 */
export function exchangeGoogleCode(
  client: ApiClient,
  code: string,
): Promise<ApiResult<AuthSession>> {
  return client.request<AuthSession>('/v1/auth/google/exchange', {
    method: 'POST',
    body: { code },
    anonymous: true,
  });
}

/**
 * Обмен id_token из нативного окна Google на сессию.
 *
 * Отличается от exchangeGoogleCode тем, ЧТО проверяет сервер: здесь подпись
 * самого Google на токене (публичными ключами Google, аудитория — web-клиент
 * сайта), там — свой одноразовый код из базы. Пути разные, результат один.
 *
 * Не идемпотентен: повторять нечего, id_token живёт час и второй запрос с ним
 * ничего не изменит, а сеть уже подтвердила отказ.
 */
export function signInWithGoogleIdToken(
  client: ApiClient,
  idToken: string,
): Promise<ApiResult<AuthSession>> {
  return client.request<AuthSession>('/v1/auth/google', {
    method: 'POST',
    body: { id_token: idToken },
    anonymous: true,
  });
}

export function getMe(client: ApiClient): Promise<ApiResult<User>> {
  return client.request<User>('/auth/me', { idempotent: true });
}

/** Отзывает refresh-токен на сервере. Локальную очистку делает вызывающий. */
export function logout(client: ApiClient, refreshToken: string): Promise<ApiResult<unknown>> {
  return client.request('/v1/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
    anonymous: true,
  });
}

/**
 * B5 — удаление аккаунта и всех данных. Обязательное требование обоих
 * магазинов, проверяется на ревью; должно быть доступно не более чем в 3 тапа
 * от главного экрана (§8.5, Apple Guideline 5.1.1(v)).
 *
 * Без тела: пароля у аккаунта Google нет и подтверждать им нечего. Защита от
 * случайного нажатия — подтверждение на экране настроек.
 */
export function deleteAccount(client: ApiClient): Promise<ApiResult<unknown>> {
  return client.request('/v1/account', { method: 'DELETE' });
}
