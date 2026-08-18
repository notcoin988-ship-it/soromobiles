import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import VerifyEmailScreen from '../VerifyEmailScreen';
import { useAuthStore } from '../../../features/auth/authStore';

/**
 * Компонентные тесты подтверждения почты (§14, §8.2).
 *
 * Экран короткий, но именно он стоит между регистрацией и продуктом: любая
 * его поломка означает, что зарегистрировавшийся человек не может войти.
 * Отсюда набор проверок:
 *
 * • код приходит письмом и попадает в поле ВСТАВКОЙ. Почтовые клиенты тащат
 *   вместе с ним пробелы, неразрывные пробелы и переносы — без чистки поле
 *   получит «123 456», валидация скажет «нужно 6 цифр», и человек окажется
 *   в тупике с правильным кодом на руках;
 * • автоотправка по шестой цифре экономит тап на медленной связи, но она же
 *   легко ломается вместе с чисткой ввода — проверяется отдельно;
 * • таймер повторной отправки (§8.2): пока он идёт, ссылки быть не должно,
 *   после — обязана появиться. Иначе либо человек долбит сервер письмами,
 *   либо навсегда остаётся без письма, если первое не дошло.
 */

const noop = () => {};

const setup = () => render(<VerifyEmailScreen onBack={noop} />);

describe('экран подтверждения почты', () => {
  beforeEach(() => {
    useAuthStore.setState({
      busy: false,
      fieldErrors: {},
      formError: null,
      pendingEmail: 'test@zehn.ai',
      lastCodeSentAt: null,
    });
  });

  it('неполный код не отправляется', async () => {
    const verify = jest.fn(async () => {});
    useAuthStore.setState({ verify });

    const ui = await setup();
    await fireEvent.changeText(ui.getByTestId('verify-code'), '123');
    await fireEvent.press(ui.getByTestId('verify-submit'));

    expect(verify).not.toHaveBeenCalled();
    expect(ui.getByText('Рамз бояд аз 6 рақам иборат бошад')).toBeTruthy();
  });

  it('в поле попадают только цифры', async () => {
    const verify = jest.fn(async () => {});
    useAuthStore.setState({ verify });

    const ui = await setup();
    await fireEvent.changeText(ui.getByTestId('verify-code'), 'код 12a3');

    expect(ui.getByTestId('verify-code').props.value).toBe('123');
    expect(verify).not.toHaveBeenCalled();
  });

  it('код, вставленный из письма с пробелами, уходит сам', async () => {
    const verify = jest.fn(async () => {});
    useAuthStore.setState({ verify });

    const ui = await setup();
    await fireEvent.changeText(ui.getByTestId('verify-code'), ' 123 456 ');

    expect(ui.getByTestId('verify-code').props.value).toBe('123456');
    expect(verify).toHaveBeenCalledWith('123456');
  });

  it('лишние цифры обрезаются: письмо могло приехать вместе с номером заказа', async () => {
    const verify = jest.fn(async () => {});
    useAuthStore.setState({ verify });

    const ui = await setup();
    await fireEvent.changeText(ui.getByTestId('verify-code'), '12345678');

    expect(ui.getByTestId('verify-code').props.value).toBe('123456');
    expect(verify).toHaveBeenCalledWith('123456');
  });

  it('неверный код показывается под полем, а не алертом (§8.2)', async () => {
    useAuthStore.setState({ fieldErrors: { code: 'authErrors.invalidCode' } });

    const ui = await setup();
    expect(ui.getByText('Рамз нодуруст аст')).toBeTruthy();
  });

  it('повторная отправка открывается только после таймера', async () => {
    const resend = jest.fn(async () => {});

    // Таймер читает Date.now(), поэтому время должно быть поддельным целиком —
    // иначе отсчёт не сдвинуть, не заставив тест ждать реальную минуту.
    jest.useFakeTimers();
    try {
      useAuthStore.setState({ resend, lastCodeSentAt: Date.now() });

      const ui = await setup();
      expect(ui.getByText('Такрор фиристодан пас аз 60 с')).toBeTruthy();
      expect(ui.queryByText('Такрор фиристодан')).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });

      await fireEvent.press(ui.getByText('Такрор фиристодан'));
      expect(resend).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
