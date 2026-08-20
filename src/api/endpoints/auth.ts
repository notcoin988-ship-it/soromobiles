import type { ApiClient, ApiResult } from '../client';
import type { AuthSession, User } from '../types';

/**
 * Авторизация через Google — единственный вход приложения (§6.6 в редакции
 * после отказа от почты и пароля).
 *
 * Регистрации по почте с 6-значным кодом из письма БОЛЬШЕ НЕТ: ни /register,
 * ни /verify, ни /resend, ни восстановления пароля. Вместе с ними ушла и вся
 * зависимость от SMTP.
 *
 * Серверу достаётся ровно одна ручка. Приложение получает id_token двумя
 * способами — системным окном Google либо, если сервисов Google на телефоне
 * нет, браузером по PKCE напрямую с Google (features/auth/googleSignIn), — но
 * оба заканчиваются одинаковым токеном, и проверяет его POST /v1/auth/google.
 * Ни редиректов через наш сервер, ни таблиц под одноразовые коды: браузерный
 * обмен целиком живёт внутри приложения.
 *
 * Почему не cookie, как в вебе: §6.2 запрещает cookie-сессию мобильному
 * клиенту — она живёт 2 часа, а приложение обязано не спрашивать вход при
 * каждом запуске.
 *
 * Чего здесь нет намеренно (§8.2): гостевого режима и входа по номеру
 * телефона. Sign in with Apple не делаем по решению заказчика — он обязателен
 * по Guideline 4.8 только для релиза в App Store, а первым выходит Android.
 */

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
