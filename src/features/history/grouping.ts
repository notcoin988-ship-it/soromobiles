/**
 * Группировка списка чатов по датам для drawer (§8.4).
 *
 * ТЗ отсылает к groupForDate из soro_front/src/i18n.js, но репозитория веба
 * нет — логика восстановлена по видимым в §7.7 и Приложении C.3 группам:
 * Имрӯз · Дирӯз · 7 рӯзи гузашта · 30 рӯзи гузашта · Пештар.
 * Когда репозиторий появится, сверить границы «7» и «30» с оригиналом.
 *
 * Возвращаются i18n-ключи, а не строки: §9 запрещает строки вне i18n/.
 * Границы считаются по КАЛЕНДАРНЫМ дням в локальной зоне пользователя,
 * а не по «минус 24 часа» — иначе чат, созданный вчера в 23:50, утром попадёт
 * в «Имрӯз».
 */

export type HistoryGroupKey =
  | 'history.today'
  | 'history.yesterday'
  | 'history.prev7'
  | 'history.prev30'
  | 'history.older';

export const HISTORY_GROUP_ORDER: readonly HistoryGroupKey[] = [
  'history.today',
  'history.yesterday',
  'history.prev7',
  'history.prev30',
  'history.older',
] as const;

/** Полночь локального дня — точка отсчёта для календарной разницы. */
function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Разница в целых календарных днях: сегодня → 0, вчера → 1. */
export function calendarDaysAgo(value: Date | string | number, now: Date = new Date()): number {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const diffMs = startOfLocalDay(now) - startOfLocalDay(date);
  return Math.round(diffMs / 86_400_000);
}

export function groupForDate(value: Date | string | number, now: Date = new Date()): HistoryGroupKey {
  const days = calendarDaysAgo(value, now);

  // Чат из будущего (расхождение часов клиента и сервера) показываем как
  // сегодняшний, а не прячем в «Пештар».
  if (days <= 0) return 'history.today';
  if (days === 1) return 'history.yesterday';
  if (days <= 7) return 'history.prev7';
  if (days <= 30) return 'history.prev30';
  return 'history.older';
}

export type GroupedSection<T> = { key: HistoryGroupKey; items: T[] };

/**
 * Раскладывает чаты по секциям в порядке §8.4, отбрасывая пустые.
 * Внутри секции порядок входного массива сохраняется — список приходит уже
 * отсортированным по updated_at DESC (§6.3.2).
 */
export function groupByDate<T>(
  items: readonly T[],
  getDate: (item: T) => Date | string | number,
  now: Date = new Date(),
): GroupedSection<T>[] {
  const buckets = new Map<HistoryGroupKey, T[]>();

  for (const item of items) {
    const key = groupForDate(getDate(item), now);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }

  return HISTORY_GROUP_ORDER.filter((key) => buckets.has(key)).map((key) => ({
    key,
    items: buckets.get(key)!,
  }));
}
