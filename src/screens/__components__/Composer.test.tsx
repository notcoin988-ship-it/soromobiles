import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import ChatScreen from '../ChatScreen';
import { useChatStore } from '../../features/chat/chatStore';

/**
 * Компонентные тесты композера (§14).
 *
 * Композер — единственное место, через которое в продукт попадает вопрос,
 * поэтому проверяется ровно то, что ломает его в бою: пустая отправка,
 * пробелы вместо текста, блокировка при исчерпанном лимите (§8.6) и
 * превращение кнопки отправки в «Стоп» во время генерации (§8.3).
 */

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ openDrawer: jest.fn() }),
}));

/**
 * Экран читает безопасные зоны (§7.4), а в тестовой среде их сообщать некому.
 * Подставляем размеры обычного телефона: без них useSafeAreaInsets бросает.
 */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * Экран берёт название чата из списка на TanStack Query (§4.2), поэтому ему
 * нужен провайдер. Клиент создаётся свой на каждый тест: общий протекал бы
 * кэшем между проверками, а ретраи выключены — падать по таймауту нечему.
 */
const renderScreen = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <ChatScreen />
      </SafeAreaProvider>
    </QueryClientProvider>,
  );

const CLEAN = {
  chatId: null,
  messages: [],
  generating: false,
  limit: null,
  errorKey: null,
  classLevel: null,
};

describe('композер', () => {
  beforeEach(() => {
    useChatStore.setState({ ...CLEAN, send: jest.fn(), stop: jest.fn() });
  });

  it('пустое поле не отправляется', async () => {
    const send = jest.fn();
    useChatStore.setState({ send });

    const ui = await renderScreen();
    await fireEvent.press(ui.getByTestId('chat-send'));

    expect(send).not.toHaveBeenCalled();
  });

  it('одни пробелы не отправляются', async () => {
    const send = jest.fn();
    useChatStore.setState({ send });

    const ui = await renderScreen();
    await fireEvent.changeText(ui.getByTestId('chat-input'), '   ');
    await fireEvent.press(ui.getByTestId('chat-send'));

    expect(send).not.toHaveBeenCalled();
  });

  it('вопрос уходит без ведущих и хвостовых пробелов', async () => {
    const send = jest.fn();
    useChatStore.setState({ send });

    const ui = await renderScreen();
    await fireEvent.changeText(ui.getByTestId('chat-input'), '  Салом  ');
    await fireEvent.press(ui.getByTestId('chat-send'));

    expect(send).toHaveBeenCalledWith('Салом');
  });

  it('§8.6: при исчерпанном лимите поле заблокировано и вопрос не уходит', async () => {
    const send = jest.fn();
    useChatStore.setState({
      send,
      limit: { message: 'Лимит', resetsInHours: 9, resetsAtLocal: '00:00' },
    });

    const ui = await renderScreen();
    expect(ui.getByTestId('chat-input').props.editable).toBe(false);

    await fireEvent.changeText(ui.getByTestId('chat-input'), 'Салом');
    await fireEvent.press(ui.getByTestId('chat-send'));
    expect(send).not.toHaveBeenCalled();
  });

  it('§8.3: во время генерации кнопка отправки останавливает поток', async () => {
    const send = jest.fn();
    const stop = jest.fn();
    useChatStore.setState({
      send,
      stop,
      generating: true,
      messages: [{ id: 'a', role: 'assistant', content: '', streaming: true }],
    });

    const ui = await renderScreen();
    await fireEvent.press(ui.getByTestId('chat-send'));

    // Именно стоп, а не повторная отправка: §5.4 требует сохранить
    // полученный текст, а не начать заново.
    expect(stop).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
