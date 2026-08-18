import type { ApiClient, ApiResult } from '../client';
import type { ChatInfo, ChatStatus, ChatWithMessages } from '../types';

/**
 * Чаты (§6.3.2).
 *
 * Права: чужой чат → 403, несуществующий → 404. На 404 клиент обязан убрать
 * чат из локальной БД и вернуть на список (§6.5).
 */

/**
 * Список чатов.
 *
 * ВСЕГДА с ?status=active. Без параметра бэкенд отдаёт и deleted-чаты (B13) —
 * веб фильтрует на клиенте, мы не повторяем эту ошибку. Мок-сервер намеренно
 * воспроизводит то же поведение, чтобы забытый параметр было видно сразу.
 */
export function listChats(
  client: ApiClient,
  status: ChatStatus = 'active',
): Promise<ApiResult<ChatInfo[]>> {
  return client.request<ChatInfo[]>(`/v1/chat/list?status=${status}`, { idempotent: true });
}

/**
 * Создание чата. Заголовок всегда "Чати нав" — сервер его никогда не меняет
 * (B10). До реализации B10 клиент сам вызывает rename первыми 30 символами
 * первого вопроса.
 */
export function createChat(
  client: ApiClient,
  projectId: string | null = null,
): Promise<ApiResult<{ chat_id: string }>> {
  return client.request<{ chat_id: string }>('/v1/chat/create', {
    method: 'POST',
    body: { project_id: projectId },
  });
}

/** Чат с историей. Возвращает ВСЕ сообщения без пагинации (B12). */
export function getChat(client: ApiClient, chatId: string): Promise<ApiResult<ChatWithMessages>> {
  return client.request<ChatWithMessages>(`/v1/chat/${chatId}`, { idempotent: true });
}

export function renameChat(
  client: ApiClient,
  chatId: string,
  title: string,
): Promise<ApiResult<ChatInfo>> {
  return client.request<ChatInfo>(`/v1/chat/${chatId}/rename`, {
    method: 'PATCH',
    body: { title },
    idempotent: true,
  });
}

/** Мягкое удаление: status = 'deleted' (§6.3.2). */
export function deleteChat(client: ApiClient, chatId: string): Promise<ApiResult<unknown>> {
  return client.request(`/v1/chat/${chatId}/delete`, { method: 'DELETE', idempotent: true });
}

/** Обходной путь для B10, пока сервер не формирует заголовок сам. */
export const TITLE_FROM_QUESTION_LENGTH = 30;

export function titleFromQuestion(question: string): string {
  return question.trim().slice(0, TITLE_FROM_QUESTION_LENGTH);
}
