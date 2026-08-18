import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '../../api';
import {
  deleteChat as deleteChatRemote,
  listChats as listChatsRemote,
  renameChat as renameChatRemote,
} from '../../api/endpoints/chats';
import { isConnected } from '../../api/network';
import { queryKeys } from '../../api/queryClient';
import * as db from '../../db';
import type { ChatRow } from '../../db/schema';

/**
 * Список диалогов на TanStack Query (§4.2) поверх SQLite (§10).
 *
 * Порядок работы задан §8.4 — «список читается из локальной SQLite и работает
 * без сети», — поэтому обычная схема Query «сходить на сервер и показать
 * результат» здесь не годится. Схема такая:
 *
 *   1. initialData — то, что уже лежит в SQLite. Экран заполняется мгновенно
 *      и работает в самолёте.
 *   2. queryFn — сходить на сервер, записать полученное в SQLite и вернуть
 *      прочитанное ОТТУДА. Источник истины остаётся один (§5.2), а не
 *      расходится на «то, что в кэше Query» и «то, что в базе».
 *   3. Без сети queryFn просто отдаёт содержимое базы, не трогая сервер.
 *
 * Мутации (переименование, удаление) применяются к базе сразу, а серверу
 * уходят следом: свайп обязан ощущаться мгновенно.
 */

/** Синхронное чтение базы для initialData — Query ждать промис не будет. */
let cachedRows: ChatRow[] = [];

export function primeChatsCache(rows: ChatRow[]): void {
  cachedRows = rows;
}

async function loadFromDb(query: string): Promise<ChatRow[]> {
  const rows = await db.searchChats(query);
  cachedRows = rows;
  return rows;
}

export function useChats(query: string) {
  return useQuery({
    // Запрос входит в ключ: результаты поиска не должны затирать общий список.
    queryKey: [...queryKeys.chats, query],
    initialData: cachedRows,

    /**
     * Дата «нулевая», то есть содержимое кэша считается устаревшим сразу.
     *
     * Без этого список не наполнялся ВООБЩЕ. initialData без даты Query
     * помечает свежей на весь staleTime (минуту), а глобальный
     * refetchOnMount: false запрещает перезапрос при открытии drawer — вместе
     * это давало замкнутый круг: queryFn не вызывался, а он и есть тот код,
     * который читает SQLite и наполняет cachedRows. На устройстве видно было
     * так: чаты есть и на сервере, и в базе, а в drawer «Ҳанӯз чате нест».
     */
    initialDataUpdatedAt: 0,

    /**
     * Перезапрос при открытии drawer — да, но не чаще staleTime. Глобальный
     * запрет здесь снят намеренно: queryFn не «поход в сеть», а чтение
     * локальной базы, которое при наличии связи ещё и подтягивает серверное.
     * Без сети (isConnected) он до сети не доходит вовсе.
     */
    refetchOnMount: true,

    async queryFn() {
      // Без сети — только база. Ошибку не возвращаем: отсутствие интернета
      // это не сбой списка, он и должен работать офлайн (§8.4).
      if (!isConnected()) return loadFromDb(query);

      // ?status=active обязателен (B13): без него приходят и удалённые чаты.
      const result = await listChatsRemote(api);
      if (result.ok) {
        for (const chat of result.data) {
          await db.upsertChat({
            id: chat.id,
            title: chat.title,
            status: chat.status,
            created_at: chat.created_at,
            updated_at: chat.updated_at,
          });
        }
      }

      // Возвращаем прочитанное из базы в любом случае: даже когда сервер
      // недоступен, показать локальное лучше, чем пустой экран.
      return loadFromDb(query);
    },
  });
}

export function useRenameChat() {
  const client = useQueryClient();

  return useMutation({
    async mutationFn({ chatId, title }: { chatId: string; title: string }) {
      const trimmed = title.trim();
      if (trimmed.length === 0) return;

      // Локально сразу — свайп должен срабатывать мгновенно.
      await db.renameChatLocally(chatId, trimmed);
      // На сервер следом. Если не пройдёт, следующий sync вернёт серверное имя.
      void renameChatRemote(api, chatId, trimmed);
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.chats }),
  });
}

export function useDeleteChat() {
  const client = useQueryClient();

  return useMutation({
    async mutationFn(chatId: string) {
      // На сервере удаление мягкое (status = 'deleted'), локально — обычное
      // DELETE: удалённый чат не показывается, сообщения уходят каскадом.
      await db.deleteChat(chatId);
      void deleteChatRemote(api, chatId);
    },
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.chats }),
  });
}
