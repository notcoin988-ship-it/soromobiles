import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { QueryClientProvider } from '@tanstack/react-query';

import { api } from './src/api';
import { queryClient } from './src/api/queryClient';
import { onReconnect, startNetworkWatch } from './src/api/network';
import { sendEvent } from './src/api/endpoints/misc';
import { setEventSink, track } from './src/telemetry/events';
import { initSentry } from './src/telemetry/sentry';
import { listChats as listLocalChats, openDatabase } from './src/db';
import { primeChatsCache } from './src/features/history/useChats';
import { useChatStore } from './src/features/chat/chatStore';
import { drainOutbox, onOutboxDelivered } from './src/features/chat/outbox';
import { initI18n } from './src/i18n';
import RootNavigator from './src/navigation/RootNavigator';
import { useConfigStore } from './src/store/config';
import { useSettingsStore, useThemeName } from './src/store/settings';

/**
 * Точка входа.
 *
 * i18n инициализируется до первого рендера: язык по умолчанию — таджикский,
 * независимо от языка системы (§9).
 */
initI18n(useSettingsStore.getState().language);

/**
 * Подписка на состояние сети — до первого запроса. Без неё клиент не отличит
 * «нет интернета» от «сервер недоступен», и три состояния ошибки §8.7
 * схлопнутся в два.
 */
startNetworkWatch();

/**
 * Отчёты о сбоях (§13). Поднимается до всего остального, чтобы поймать в том
 * числе падения при инициализации. Без DSN в окружении не делает ничего.
 */
initSentry();

/**
 * Обезличенные счётчики событий (§13). Уходят на СВОЙ бэкенд, сторонних
 * трекеров в проекте нет (§4.3).
 *
 * Отправка best-effort: результат не проверяется и ошибка не показывается —
 * аналитика не имеет права влиять ни на скорость, ни на работу продукта.
 */
setEventSink((payload) => {
  void sendEvent(api, payload);
});

track({ name: 'app_open' });

/**
 * Конфигурация с сервера при холодном старте (B6, §6.6).
 *
 * Не блокирует запуск: fetchConfig при недоступности отдаёт зашитый набор,
 * поэтому падение этой ручки не мешает войти в приложение. Но пока ответ не
 * пришёл, ссылки на документы и тексты подсказок берутся из зашитых значений.
 */
void useConfigStore.getState().load();

export default function App() {
  const themeName = useThemeName();

  /**
   * Очередь отправки (§5.5) и локальная история (§10).
   *
   * База открывается один раз при старте: первое обращение к ней иначе
   * пришлось бы на отправку сообщения, а создание таблиц там — лишние
   * десятки миллисекунд ровно в тот момент, когда пользователь ждёт ответа.
   *
   * Разбор очереди запускается дважды: сразу (приложение могли закрыть с
   * непустой очередью и открыть уже с сетью) и на каждое восстановление
   * связи. Повторный вызов безопасен — drainOutbox не запускается дважды.
   */
  useEffect(() => {
    void openDatabase().then(async () => {
      // Список чатов в память — до первого открытия drawer. Иначе первый кадр
      // списка пуст даже там, где база полна, а в самолёте пустым он и
      // останется: сходить за ним будет некуда (§8.4, §10).
      try {
        primeChatsCache(await listLocalChats());
      } catch {
        // База не открылась — список подтянется запросом, когда появится сеть.
      }
      await drainOutbox();
    });

    const stopWatching = onReconnect(() => {
      void drainOutbox();
    });

    // Доставленное сообщение теряет пометку «Дар навбат» — но только если
    // открыт тот самый чат.
    const stopListening = onOutboxDelivered((chatId, replacedLocalId) => {
      const chat = useChatStore.getState();
      // Чат, заведённый без сети, получил настоящий id — подменяем синхронно,
      // до перечитывания ленты.
      if (replacedLocalId) chat.adoptChatId(chatId, replacedLocalId);
      void chat.refreshFromDb(chatId);
    });

    return () => {
      stopWatching();
      stopListening();
    };
  }, []);

  return (
    /**
     * GestureHandlerRootView обязателен для drawer (§8.4): без него свайп от
     * левого края на Android просто не срабатывает, и открыть список диалогов
     * можно только кнопкой.
     */
    <GestureHandlerRootView style={styles.root}>
      {/* Серверное состояние — TanStack Query (§4.2): кэш, инвалидация. */}
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          {/* Тёмная тема — по умолчанию (§7), поэтому статус-бар светлый. */}
          <StatusBar style={themeName === 'dark' ? 'light' : 'dark'} />
          <RootNavigator />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
