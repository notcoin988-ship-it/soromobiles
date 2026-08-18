import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ResetPasswordScreen from '../ResetPasswordScreen';
import { useAuthStore } from '../../../features/auth/authStore';

/**
 * Компонентные тесты восстановления пароля, шаг 2 (§14, §8.2).
 *
 * Форма с двумя полями, у каждого своя причина отказа, и §8.2 требует
 * показывать их РАЗДЕЛЬНО: человек, у которого просрочен код, и человек,
 * придумавший короткий пароль, должны исправлять разные вещи. Общая плашка
 * «проверьте введённые данные» отправила бы обоих гадать.
 *
 * Код здесь чистится от нецифр так же, как на экране подтверждения, но
 * автоотправки нет — пароль всё равно вводить руками.
 */

const noop = () => {};

const setup = () => render(<ResetPasswordScreen onBack={noop} />);

describe('экран нового пароля', () => {
  beforeEach(() => {
    useAuthStore.setState({
      busy: false,
      fieldErrors: {},
      formError: null,
      pendingEmail: 'test@zehn.ai',
    });
  });

  it('пустая форма не отправляется', async () => {
    const resetPassword = jest.fn(async () => {});
    useAuthStore.setState({ resetPassword });

    const ui = await setup();
    await fireEvent.press(ui.getByTestId('reset-submit'));

    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('обе ошибки показываются сразу и каждая под своим полем', async () => {
    const resetPassword = jest.fn(async () => {});
    useAuthStore.setState({ resetPassword });

    const ui = await setup();
    await fireEvent.changeText(ui.getByTestId('reset-code'), '123');
    await fireEvent.changeText(ui.getByTestId('reset-password'), 'Parol12');
    await fireEvent.press(ui.getByTestId('reset-submit'));

    expect(resetPassword).not.toHaveBeenCalled();
    expect(ui.getByText('Рамз бояд аз 6 рақам иборат бошад')).toBeTruthy();
    expect(ui.getByText('Парол бояд камаш 8 аломат бошад')).toBeTruthy();
  });

  it('в поле кода попадают только цифры, не больше шести', async () => {
    const ui = await setup();
    await fireEvent.changeText(ui.getByTestId('reset-code'), ' 12-34 56 78 ');

    expect(ui.getByTestId('reset-code').props.value).toBe('123456');
  });

  it('корректные данные уходят в стор', async () => {
    const resetPassword = jest.fn(async () => {});
    useAuthStore.setState({ resetPassword });

    const ui = await setup();
    await fireEvent.changeText(ui.getByTestId('reset-code'), '123456');
    await fireEvent.changeText(ui.getByTestId('reset-password'), 'ParoliNav123');
    await fireEvent.press(ui.getByTestId('reset-submit'));

    expect(resetPassword).toHaveBeenCalledWith({ code: '123456', newPassword: 'ParoliNav123' });
  });

  it('просроченный код с сервера показывается под полем кода и пропадает при правке', async () => {
    useAuthStore.setState({ fieldErrors: { code: 'authErrors.expiredCode' } });

    const ui = await setup();
    expect(ui.getByText('Мӯҳлати рамз гузаштааст')).toBeTruthy();

    // clearErrors настоящий: проверяется связка экрана со стором.
    await fireEvent.changeText(ui.getByTestId('reset-code'), '654321');
    expect(ui.queryByText('Мӯҳлати рамз гузаштааст')).toBeNull();
  });

  it('новый пароль скрыт, кнопка показа его открывает', async () => {
    const ui = await setup();
    expect(ui.getByTestId('reset-password').props.secureTextEntry).toBe(true);

    await fireEvent.press(ui.getByText('Нишон додан'));
    expect(ui.getByTestId('reset-password').props.secureTextEntry).toBe(false);
  });
});
