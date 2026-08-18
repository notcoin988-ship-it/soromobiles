import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ForgotPasswordScreen from '../ForgotPasswordScreen';
import { useAuthStore } from '../../../features/auth/authStore';

/**
 * Компонентные тесты восстановления пароля, шаг 1 (§14, §8.2).
 *
 * Главное здесь — то, чего экран НЕ делает. Сервер по §6.6 всегда отвечает
 * 202, существует аккаунт или нет: иначе форма превращается в проверялку
 * «зарегистрирован ли такой человек». Экран обязан вести дальше одинаково в
 * обоих случаях, и «дружелюбная» правка вида «покажем, что почта не найдена»
 * сломает ровно это. Тест фиксирует поведение до того, как правка случится.
 */

const noop = () => {};

const setup = (onSent = noop) =>
  render(<ForgotPasswordScreen onSent={onSent} onBack={noop} />);

describe('экран «забыли пароль»', () => {
  beforeEach(() => {
    useAuthStore.setState({ busy: false, fieldErrors: {}, formError: null });
  });

  it('пустая почта не отправляется', async () => {
    const forgotPassword = jest.fn(async () => {});
    const onSent = jest.fn();
    useAuthStore.setState({ forgotPassword });

    const ui = await setup(onSent);
    await fireEvent.press(ui.getByTestId('forgot-submit'));

    expect(forgotPassword).not.toHaveBeenCalled();
    // Шаг 2 требует кода из письма — вести туда, не отправив письмо, нельзя.
    expect(onSent).not.toHaveBeenCalled();
    expect(ui.getByText('Почтаро ворид кунед')).toBeTruthy();
  });

  it('опечатка в адресе не уходит на сервер', async () => {
    const forgotPassword = jest.fn(async () => {});
    const onSent = jest.fn();
    useAuthStore.setState({ forgotPassword });

    const ui = await setup(onSent);
    await fireEvent.changeText(ui.getByTestId('forgot-email'), 'test@zehn');
    await fireEvent.press(ui.getByTestId('forgot-submit'));

    expect(forgotPassword).not.toHaveBeenCalled();
    expect(onSent).not.toHaveBeenCalled();
    expect(ui.getByText('Почтаи электронӣ нодуруст аст')).toBeTruthy();
  });

  it('корректная почта уходит и ведёт на ввод кода', async () => {
    const forgotPassword = jest.fn(async () => {});
    const onSent = jest.fn();
    useAuthStore.setState({ forgotPassword });

    const ui = await setup(onSent);
    await fireEvent.changeText(ui.getByTestId('forgot-email'), 'test@zehn.ai');
    await fireEvent.press(ui.getByTestId('forgot-submit'));

    expect(forgotPassword).toHaveBeenCalledWith('test@zehn.ai');
    expect(onSent).toHaveBeenCalled();
  });

  it('§6.6: несуществующий аккаунт не выдаёт себя ничем', async () => {
    // Сервер ответил 202 на незнакомый адрес — стор молчит, экран обязан
    // повести себя ровно так же, как с настоящим.
    const forgotPassword = jest.fn(async () => {});
    const onSent = jest.fn();
    useAuthStore.setState({ forgotPassword });

    const ui = await setup(onSent);
    await fireEvent.changeText(ui.getByTestId('forgot-email'), 'nobody@zehn.ai');
    await fireEvent.press(ui.getByTestId('forgot-submit'));

    expect(onSent).toHaveBeenCalled();
    expect(ui.queryByText(/ёфт нашуд|не найден|not found/i)).toBeNull();
  });
});
