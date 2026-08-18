import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import SignInScreen from '../SignInScreen';
import { useAuthStore } from '../../../features/auth/authStore';

/**
 * Компонентные тесты экрана входа (§14).
 *
 * Проверяется ПОВЕДЕНИЕ, а не разметка: что форма не отправляется с пустыми
 * полями, что пароль скрыт и открывается кнопкой, что ошибка сервера видна.
 * Тесты на «есть ли такой текст» ломались бы при каждой правке формулировок
 * и не ловили бы ни одной настоящей ошибки.
 *
 * §8.2 запрещает вход через Google и гостевой режим — отдельная проверка
 * следит, чтобы они не вернулись: на сайте они есть, и соблазн «сделать как
 * в вебе» будет возникать снова.
 *
 * В react-native-testing-library 14 render и fireEvent АСИНХРОННЫ. Без await
 * тесты молча получают промис вместо результата — на этом уже потеряли время.
 */

const noop = () => {};

const setup = () => render(<SignInScreen onSignUp={noop} onForgotPassword={noop} />);

describe('экран входа', () => {
  beforeEach(() => {
    useAuthStore.setState({ busy: false, fieldErrors: {}, formError: null });
  });

  it('не отправляет форму с пустыми полями', async () => {
    const signIn = jest.fn();
    useAuthStore.setState({ signIn });

    const ui = await setup();
    await fireEvent.press(ui.getByTestId('signin-submit'));

    expect(signIn).not.toHaveBeenCalled();
  });

  it('не отправляет форму с некорректной почтой', async () => {
    const signIn = jest.fn();
    useAuthStore.setState({ signIn });

    const ui = await setup();
    await fireEvent.changeText(ui.getByTestId('signin-email'), 'далер далеров');
    await fireEvent.changeText(ui.getByTestId('signin-password'), 'Parol12345');
    await fireEvent.press(ui.getByTestId('signin-submit'));

    expect(signIn).not.toHaveBeenCalled();
  });

  it('отправляет корректные данные', async () => {
    const signIn = jest.fn();
    useAuthStore.setState({ signIn });

    const ui = await setup();
    await fireEvent.changeText(ui.getByTestId('signin-email'), 'test@zehn.ai');
    await fireEvent.changeText(ui.getByTestId('signin-password'), 'Parol12345');
    await fireEvent.press(ui.getByTestId('signin-submit'));

    expect(signIn).toHaveBeenCalledWith('test@zehn.ai', 'Parol12345');
  });

  it('пароль скрыт, кнопка показа его открывает', async () => {
    const ui = await setup();
    expect(ui.getByTestId('signin-password').props.secureTextEntry).toBe(true);

    await fireEvent.press(ui.getByText('Нишон додан'));
    expect(ui.getByTestId('signin-password').props.secureTextEntry).toBe(false);
  });

  it('§8.2: ни Google, ни гостевого входа на экране нет', async () => {
    const ui = await setup();

    expect(ui.queryByText(/google/i)).toBeNull();
    expect(ui.queryByText(/меҳмон/i)).toBeNull();
    expect(ui.queryByText(/гост/i)).toBeNull();
  });

  it('ошибка от сервера показывается плашкой', async () => {
    useAuthStore.setState({ formError: 'errors.serverDown' });
    const ui = await setup();

    expect(ui.getByText('Сервер дастрас нест. Дертар кӯшиш кунед')).toBeTruthy();
  });
});
