/**
 * Кольцевой буфер идентификаторов запросов (§13).
 *
 * «request_id из ответов сервера логируется локально (кольцевой буфер на 100
 * записей) и прикладывается к обращению в поддержку — так саппорт находит
 * запрос в логах бэкенда.»
 *
 * Почему кольцевой, а не просто список: приложение работает часами, запросов
 * за сессию — тысячи, и неограниченный список превратился бы в утечку памяти.
 * Сто записей покрывают всё, что человек успел сделать до того, как решил
 * пожаловаться.
 *
 * ЧТО СЮДА НЕ ПОПАДАЕТ: ни текста вопросов, ни ответов, ни почты. Только
 * идентификатор, путь и код ответа — этого саппорту достаточно, чтобы найти
 * запрос в логах, а утечь отсюда нечему (§11).
 */

export const REQUEST_LOG_SIZE = 100;

export type RequestLogEntry = {
  /** request_id из тела ответа. Без него запись бессмысленна. */
  requestId: string;
  /** Путь без query: в query бывает почта при восстановлении пароля. */
  path: string;
  status: number;
  at: number;
};

/**
 * Хранилище. Обычный массив со сдвигом: сто элементов — не тот размер, ради
 * которого стоит городить индексную арифметику.
 */
let entries: RequestLogEntry[] = [];

/** Путь без query и без хвостовых идентификаторов чата. */
export function normalizePath(path: string): string {
  const withoutQuery = path.split('?')[0];
  // /v1/chat/79eaae1a-.../rename → /v1/chat/{id}/rename: сам идентификатор
  // чата не секрет, но в логе он только мешает группировке.
  return withoutQuery.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/{id}',
  );
}

export function rememberRequest(entry: RequestLogEntry): void {
  entries.push({ ...entry, path: normalizePath(entry.path) });
  if (entries.length > REQUEST_LOG_SIZE) {
    entries = entries.slice(entries.length - REQUEST_LOG_SIZE);
  }
}

/** Достаёт request_id из тела ответа, каким бы оно ни пришло. */
export function requestIdOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;

  const record = body as Record<string, unknown>;
  if (typeof record.request_id === 'string') return record.request_id;

  // Ошибки заворачивают его в detail (§6.5).
  const detail = record.detail;
  if (typeof detail === 'object' && detail !== null) {
    const inner = (detail as Record<string, unknown>).request_id;
    if (typeof inner === 'string') return inner;
  }
  return null;
}

export function recentRequests(): readonly RequestLogEntry[] {
  return entries;
}

/**
 * Текст для обращения в поддержку. Свежие записи сверху: сбой, из-за которого
 * человек пишет, почти всегда последний.
 */
export function formatForSupport(limit = 10): string {
  return entries
    .slice(-limit)
    .reverse()
    .map((e) => `${new Date(e.at).toISOString()} ${e.status} ${e.path} ${e.requestId}`)
    .join('\n');
}

export function clearRequestLog(): void {
  entries = [];
}
