import { ApiClient } from './client';
import {
  INITIAL_STATE,
  initialActive,
  mirrorOf,
  nextState,
  type ActiveHost,
  type FailoverState,
} from './hostFailover';
import { isConnected } from './network';
import { secureTokenStore } from '../features/auth/tokenStore';
import { settingsStorage } from '../store/kv';

/**
 * Единственный экземпляр API-клиента на приложение.
 *
 * Базовый URL берётся из окружения и не хардкодится в коде экранов (§6.1).
 * Expo инлайнит переменные с префиксом EXPO_PUBLIC_ на этапе сборки.
 */

const DEFAULT_BASE_URL = 'http://localhost:8787';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_BASE_URL;

/**
 * Запасной адрес — второе имя того же сервера (см. hostFailover.ts).
 *
 * Руками адрес по-прежнему НЕ переключается: здесь была функция
 * overrideBaseUrl для дев-входа гостем, она уводила весь клиент на прод и
 * стоила дорого — после одного нажатия приложение молча переставало ходить на
 * мок. Переключение осталось только автоматическим и только по недоступности.
 */
export const API_MIRROR_URL = mirrorOf(API_BASE_URL);

/** Ключ в MMKV: какой адрес работал в прошлый раз и когда это выяснилось. */
const HOST_KEY = 'api.host.v1';

function readSaved(): { active: ActiveHost; at: number } | null {
  const raw = settingsStorage.getString(HOST_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { active, at } = parsed as { active?: unknown; at?: unknown };
    if ((active !== 'primary' && active !== 'mirror') || typeof at !== 'number') return null;
    return { active, at };
  } catch {
    // Обрывок записи не должен ронять запуск — просто начинаем с основного.
    return null;
  }
}

let failover: FailoverState = API_MIRROR_URL
  ? { ...INITIAL_STATE, active: initialActive(readSaved(), Date.now()) }
  : INITIAL_STATE;

function resolveBaseUrl(): string {
  return failover.active === 'mirror' && API_MIRROR_URL ? API_MIRROR_URL : API_BASE_URL;
}

/** Какой адрес используется сейчас — нужно экрану поддержки (§13). */
export function activeBaseUrl(): string {
  return resolveBaseUrl();
}

function noteHost(event: 'reachable' | 'unreachable'): void {
  // Зеркала нет (дев-сборка против localhost) — переключаться некуда.
  if (!API_MIRROR_URL) return;

  const updated = nextState(failover, event);
  if (updated.active === failover.active && updated.failures === failover.failures) return;

  const switched = updated.active !== failover.active;
  failover = updated;

  if (switched) {
    settingsStorage.set(HOST_KEY, JSON.stringify({ active: failover.active, at: Date.now() }));
  }
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
  onHostReachable: () => noteHost('reachable'),
  onHostUnreachable: () => noteHost('unreachable'),
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
export * from './hostFailover';
export * from './errors';
export * from './types';
