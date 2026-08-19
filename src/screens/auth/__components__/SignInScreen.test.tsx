import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SignInScreen from '../SignInScreen';
import { useAuthStore } from '../../../features/auth/authStore';

/**
 * Компонентные тесты экрана входа (§14).
 *
 * Проверяется ПОВЕДЕНИЕ, а не разметка: что кнопка запускает вход, что во
 * время входа она заблокирована, что ошибка видна, что документы раскрыты до
 * создания аккаунта. Тесты на «есть ли такой текст» ломались бы при каждой
 * правке формулировок и не ловили бы ни одной настоящей ошибки.
 *
 * Раньше здесь стояла проверка, что кнопки Google на экране НЕТ: §8.2 её
 * запрещал. Запрет снят — вход через Google теперь единственный, как на
 * sorollm.tj. Взамен проверяется обратное: что полей почты и пароля не
 * осталось, иначе форма вернётся вместе со всей перепиской по SMTP.
 *
 * В react-native-testing-library 14 render и fireEvent АСИНХРОННЫ. Без await
 * тесты молча получают промис вместо результата — на этом уже потеряли время.
 */

/** Окно политики берёт отступы у SafeAreaProvider — без него оно падает. */
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const setup = () => render(<SafeAreaProvider initialMetrics={METRICS}><SignInScreen /></SafeAreaProvider>);

describe('экран входа', () => {
  beforeEach(() => {
    useAuthStore.setState({ busy: false, formError: null });
  });

  it('кнопка запускает вход через Google', async () => {
    const signInWithGoogle = jest.fn();
    useAuthStore.setState({ signInWithGoogle });

    const ui = await setup();
    await fireEvent.press(ui.getByTestId('signin-google'));

    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    // Тема уходит внутрь: панель встроенного браузера красится в цвета
    // приложения, иначе поверх тёмной темы распахивается белая полоса.
    expect(signInWithGoogle).toHaveBeenCalledWith('dark');
  });

  it('во время входа повторное нажатие не проходит', async () => {
    // Иначе второе окно браузера открывается поверх первого, а сервер получает
    // два OAuth-обмена, из которых сгодится только один.
    const signInWithGoogle = jest.fn();
    useAuthStore.setState({ signInWithGoogle, busy: true });

    const ui = await setup();
    await fireEvent.press(ui.getByTestId('signin-google'));

    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  it('ни почты, ни пароля на экране не осталось', async () => {
    const ui = await setup();

    expect(ui.queryByTestId('signin-email')).toBeNull();
    expect(ui.queryByTestId('signin-password')).toBeNull();
    expect(ui.queryByText('Почтаи электронӣ')).toBeNull();
    expect(ui.queryByText('Парол')).toBeNull();
  });

  it('ошибка входа показывается плашкой', async () => {
    useAuthStore.setState({ formError: 'authErrors.googleFailed' });
    const ui = await setup();

    expect(ui.getByText('Ворид шудан бо Google муяссар нашуд. Аз нав кӯшиш кунед')).toBeTruthy();
  });

  it('политика конфиденциальности открывается прямо с экрана входа', async () => {
    // App Store 5.1.1 и Google User Data требуют раскрыть документы там, где
    // заводится аккаунт, а заводится он именно здесь — отдельного экрана
    // регистрации больше нет.
    const ui = await setup();
    await fireEvent.press(ui.getByTestId('consent-link-privacy'));

    expect(ui.getByTestId('legal-modal')).toBeTruthy();
  });
});
