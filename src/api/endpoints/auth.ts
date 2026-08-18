import type { ApiClient, ApiResult } from '../client';
import type { AuthSession, User } from '../types';

/**
 * Авторизация по email (§6.6, задачи B1–B5).
 *
 * НИ ОДНОГО из этих эндпоинтов на живом бэкенде сегодня нет — сверено с
 * docs/openapi.json. До готовности B1–B4 всё это работает против мок-сервера.
 *
 * Чего здесь нет намеренно (§8.2): входа через Google, Apple и соцсети,
 * входа по номеру телефона, гостевого режима. Как только появится любой
 * сторонний вход, Apple потребует Sign in with Apple (§15.3, Guideline 4.8).
 */

export function register(
  client: ApiClient,
  params: { email: string; password: string; fullname: string; lang: string },
): Promise<ApiResult<{ status: string; resend_after_sec: number }>> {
  return client.request('/v1/auth/register', {
    method: 'POST',
    body: params,
    anonymous: true,
  });
}

/** Код: 6 цифр, TTL 15 минут, максимум 5 попыток (§6.6). */
export function verifyEmail(
  client: ApiClient,
  params: { email: string; code: string },
): Promise<ApiResult<AuthSession>> {
  return client.request<AuthSession>('/v1/auth/verify', {
    method: 'POST',
    body: params,
    anonymous: true,
  });
}

export function resendCode(
  client: ApiClient,
  email: string,
): Promise<ApiResult<{ resend_after_sec: number }>> {
  return client.request('/v1/auth/resend', {
    method: 'POST',
    body: { email },
    anonymous: true,
  });
}

export function login(
  client: ApiClient,
  params: { email: string; password: string },
): Promise<ApiResult<AuthSession>> {
  return client.request<AuthSession>('/v1/auth/login', {
    method: 'POST',
    body: params,
    anonymous: true,
  });
}

/**
 * Запрос восстановления. Сервер ВСЕГДА отвечает 202, независимо от того,
 * существует ли почта, — чтобы не раскрывать наличие аккаунта (§6.6).
 * Поэтому успех здесь ничего не говорит о существовании пользователя.
 */
export function forgotPassword(client: ApiClient, email: string): Promise<ApiResult<unknown>> {
  return client.request('/v1/auth/password/forgot', {
    method: 'POST',
    body: { email },
    anonymous: true,
  });
}

export function resetPassword(
  client: ApiClient,
  params: { email: string; code: string; new_password: string },
): Promise<ApiResult<AuthSession>> {
  return client.request<AuthSession>('/v1/auth/password/reset', {
    method: 'POST',
    body: params,
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
 */
export function deleteAccount(client: ApiClient, password: string): Promise<ApiResult<unknown>> {
  return client.request('/v1/account', { method: 'DELETE', body: { password } });
}

/** Минимум 8 символов (§6.6). Проверку на частые пароли делает сервер. */
export const MIN_PASSWORD_LENGTH = 8;

export function isPasswordAcceptable(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}
