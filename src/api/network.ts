import NetInfo from '@react-native-community/netinfo';

import { resolveConnectivity } from './connectivity';

/**
 * Подписка на состояние сети (§8.7, §10).
 *
 * Само правило «онлайн или нет» живёт в connectivity.ts — там нет импортов и
 * оно покрыто тестами. Здесь только мост к нативному модулю.
 *
 * Сетевой клиент спрашивает состояние синхронно на каждом запросе, поэтому
 * ответ кэшируется, а подписка держит его свежим.
 */

/**
 * Оптимистичный старт: до первого события подписки считаем, что сеть есть.
 * Иначе первый же запрос при холодном старте ошибочно уйдёт в 'offline'.
 */
let connected = true;
let unsubscribe: (() => void) | null = null;

/**
 * Подписчики на ВОССТАНОВЛЕНИЕ связи (§5.5). Именно на переход false → true,
 * а не на каждое событие NetInfo: при переключении Wi-Fi → 4G событий приходит
 * несколько подряд, и разбор очереди запускался бы по кругу.
 */
const reconnectListeners = new Set<() => void>();

function apply(next: boolean): void {
  const restored = !connected && next;
  connected = next;
  if (!restored) return;
  for (const listener of reconnectListeners) listener();
}

/** Вызывается один раз при старте приложения, до первого запроса. */
export function startNetworkWatch(): void {
  if (unsubscribe) return;

  unsubscribe = NetInfo.addEventListener((state) => {
    apply(resolveConnectivity(state));
  });

  // Первое значение подписка присылает не мгновенно — спрашиваем сразу.
  void NetInfo.fetch().then((state) => {
    apply(resolveConnectivity(state));
  });
}

/** Возвращает функцию отписки. */
export function onReconnect(listener: () => void): () => void {
  reconnectListeners.add(listener);
  return () => reconnectListeners.delete(listener);
}

export function stopNetworkWatch(): void {
  unsubscribe?.();
  unsubscribe = null;
}

/** Синхронный ответ для ApiClient — он не может ждать промис на каждом запросе. */
export function isConnected(): boolean {
  return connected;
}
