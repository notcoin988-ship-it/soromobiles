import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';

import { useChats } from '../useChats';
import { queryClient } from '../../../api/queryClient';
import * as db from '../../../db';

/**
 * Список диалогов (§8.4, §10).
 *
 * Регрессия, найденная ручной проверкой на устройстве: drawer показывал
 * «Ҳанӯз чате нест» при том, что чаты лежали и в SQLite, и на сервере.
 * Виновато было сочетание трёх настроек Query: initialData без даты считается
 * свежей на весь staleTime, глобальный refetchOnMount выключен, а SQLite
 * читает именно queryFn — он не вызывался ни разу, и наполниться списку было
 * неоткуда ни с сетью, ни без неё.
 *
 * Проверяется хук, а не весь drawer: экран тянет FlashList и Swipeable, и
 * тест про настройки кэша превратился бы в тест про жесты.
 *
 * Клиент берётся НАСТОЯЩИЙ (api/queryClient): смысл теста в том, чтобы
 * убедиться в работоспособности именно прикладных умолчаний. Свой QueryClient
 * с retry: false и staleTime: 0 прошёл бы и на сломанном коде.
 */

jest.mock('../../../db', () => ({
  searchChats: jest.fn(),
  upsertChat: jest.fn(),
}));

// Без сети: тогда queryFn обязан отдать содержимое локальной базы (§10).
jest.mock('../../../api/network', () => ({ isConnected: () => false }));

const CHAT = {
  id: 'c1',
  title: 'Қуллаҳои Тоҷикистон',
  status: 'active' as const,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('список диалогов', () => {
  beforeEach(() => {
    queryClient.clear();
    (db.searchChats as jest.Mock).mockReset().mockResolvedValue([CHAT]);
  });

  it('читает локальную базу при первом же монтировании', async () => {
    const { result } = await renderHook(() => useChats(''), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0]?.title).toBe('Қуллаҳои Тоҷикистон');
    expect(db.searchChats).toHaveBeenCalled();
  });
});
