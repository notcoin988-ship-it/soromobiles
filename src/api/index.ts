import { ApiClient } from './client';
import { isConnected } from './network';
import { secureTokenStore } from '../features/auth/tokenStore';

/**
 * Единственный экземпляр API-клиента на приложение.
 *
 * Базовый URL берётся из окружения и не хардкодится в коде экранов (§6.1).
 * Expo инлайнит переменные с префиксом EXPO_PUBLIC_ на этапе сборки.
 */

const DEFAULT_BASE_URL = 'http://localhost:8787';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_BASE_URL;

/**
 * Адрес задаётся ТОЛЬКО окружением и в рантайме не меняется.
 *
 * Здесь была функция overrideBaseUrl для дев-входа гостем: она уводила весь
 * клиент на прод. Стоила дорого — после одного нажатия кнопки приложение
 * молча перестало ходить на мок, а регистрация возвращала «Ҷавоб гирифта
 * нашуд», потому что запрос уходил на сервер, где такой ручки нет. Диагностика
 * заняла больше, чем сама возможность когда-либо экономила.
 */
function resolveBaseUrl(): string {
  return API_BASE_URL;
}

/**
 * Колбэк логаута задаётся снаружи: api/ не знает про навигацию и UI (§5.2).
 * Устанавливается один раз при старте приложения.
 */
let onUnauthorized: () => void = () => {};

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export { startNetworkWatch, isConnected } from './network';

export const api = new ApiClient({
  baseUrl: resolveBaseUrl,
  tokens: secureTokenStore,
  onLogout: () => onUnauthorized(),
  isConnected,
  /**
   * Логи только в дев-сборке. В релизе их нет вовсе — §11 и §13 запрещают
   * писать в системный лог что-либо о запросах: там адреса, коды ошибок и
   * косвенно тексты диалогов.
   *
   * Без этого сетевые сбои не видно ни в logcat, ни где-либо ещё: ошибка
   * доходит до пользователя как «Ҷавоб гирифта нашуд», а из чего она
   * сложилась — неизвестно. На отладке одного такого случая уже потеряли час.
   */
  log: __DEV__
    ? (message, meta) => {
        console.warn(`[api] ${message}`, meta);
      }
    : undefined,
});

export * from './client';
export * from './errors';
export * from './types';
