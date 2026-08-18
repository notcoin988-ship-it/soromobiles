import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SignUpScreen from '../SignUpScreen';
import { useAuthStore } from '../../../features/auth/authStore';
import { useSettingsStore } from '../../../store/settings';

/**
 * Компонентные тесты регистрации (§14).
 *
 * Проверяется ПОВЕДЕНИЕ формы, а не разметка — как и на экране входа.
 * Три вещи, ради которых тест написан:
 *
 * 1. §8.2 требует показывать ошибку ПОД конкретным полем, а не общим алертом.
 *    Ошибка «почта занята» приходит с сервера, а «пароль короткий» считается
 *    на клиенте — оба пути ведут к одному месту в разметке, и сломать любой
 *    из них можно независимо;
 * 2. `lang` уходит на сервер и определяет язык ПИСЬМА (§9). Захардкоженный
 *    'tg' работал бы у большинства и молча слал бы таджикское письмо тому,
 *    кто переключил приложение на русский;
 * 3. серверная ошибка обязана исчезать при правке поля. Иначе «почта занята»
 *    висит над уже исправленным адресом и выглядит как отказ регистрации.
 *
 * В react-native-testing-library 14 render и fireEvent АСИНХРОННЫ.
 */

const noop = () => {};

// Провайдер отступов безопасной зоны нужен экрану целиком.
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const setup = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SignUpScreen onSignIn={noop} />
    </SafeAreaProvider>,
  );

const fill = async (
  ui: Awaited<ReturnType<typeof setup>>,
  form: { fullname?: string; email?: string; password?: string },
) => {
  if (form.fullname !== undefined) {
    await fireEvent.changeText(ui.getByTestId('signup-fullname'), form.fullname);
  }
  if (form.email !== undefined) {
    await fireEvent.changeText(ui.getByTestId('signup-email'), form.email);
  }
  if (form.password !== undefined) {
    await fireEvent.changeText(ui.getByTestId('signup-password'), form.password);
  }
};

/**
 * Поставить галочку согласия. Вынесено отдельно, а не спрятано в fill:
 * согласие — не поле формы, и тесты, проверяющие успешную отправку, обязаны
 * показывать этот шаг явно. Иначе пропажа галочки из разметки не уронит
 * ни один тест.
 */
const accept = async (ui: Awaited<ReturnType<typeof setup>>) => {
  await fireEvent.press(ui.getByTestId('signup-consent'));
};

describe('экран регистрации', () => {
  beforeEach(() => {
    useAuthStore.setState({ busy: false, fieldErrors: {}, formError: null });
    useSettingsStore.setState({ language: 'tg' });
  });

  it('не отправляет форму с пустыми полями', async () => {
    const signUp = jest.fn(async () => {});
    useAuthStore.setState({ signUp });

    const ui = await setup();
    await fireEvent.press(ui.getByTestId('signup-submit'));

    expect(signUp).not.toHaveBeenCalled();
  });

  it('имя обязательно: §8.2 спрашивает его ровно один раз, второго шанса нет', async () => {
    const signUp = jest.fn(async () => {});
    useAuthStore.setState({ signUp });

    const ui = await setup();
    await fill(ui, { fullname: '   ', email: 'test@zehn.ai', password: 'Parol12345' });
    await fireEvent.press(ui.getByTestId('signup-submit'));

    expect(signUp).not.toHaveBeenCalled();
    expect(ui.getByText('Ном ва насабро ворид кунед')).toBeTruthy();
  });

  it('короткий пароль отсекается на клиенте, ошибка — под полем пароля', async () => {
    const signUp = jest.fn(async () => {});
    useAuthStore.setState({ signUp });

    const ui = await setup();
    await fill(ui, { fullname: 'Далер', email: 'test@zehn.ai', password: 'Parol12' });
    await fireEvent.press(ui.getByTestId('signup-submit'));

    expect(signUp).not.toHaveBeenCalled();
    expect(ui.getByText('Парол бояд камаш 8 аломат бошад')).toBeTruthy();
  });

  it('§9: язык письма берётся из настроек, а не зашит', async () => {
    const signUp = jest.fn(async () => {});
    useAuthStore.setState({ signUp });
    // Интерфейс намеренно оставлен таджикским: меняется только поле, которое
    // уходит на сервер. setLanguage дёрнул бы i18n и переключил все подписи.
    useSettingsStore.setState({ language: 'ru' });

    const ui = await setup();
    await fill(ui, { fullname: 'Далер', email: 'test@zehn.ai', password: 'Parol12345' });
    await accept(ui);
    await fireEvent.press(ui.getByTestId('signup-submit'));

    expect(signUp).toHaveBeenCalledWith({
      fullname: 'Далер',
      email: 'test@zehn.ai',
      password: 'Parol12345',
      lang: 'ru',
    });
  });

  it('«почта занята» показывается под полем почты и пропадает при правке', async () => {
    useAuthStore.setState({ fieldErrors: { email: 'authErrors.emailTaken' } });

    const ui = await setup();
    expect(ui.getByText('Ин почта аллакай истифода мешавад')).toBeTruthy();

    // clearErrors здесь НАСТОЯЩИЙ: смысл теста в связке экрана со стором.
    await fill(ui, { email: 'other@zehn.ai' });
    expect(ui.queryByText('Ин почта аллакай истифода мешавад')).toBeNull();
  });

  it('пароль скрыт, кнопка показа его открывает', async () => {
    const ui = await setup();
    expect(ui.getByTestId('signup-password').props.secureTextEntry).toBe(true);

    await fireEvent.press(ui.getByText('Нишон додан'));
    expect(ui.getByTestId('signup-password').props.secureTextEntry).toBe(false);
  });
});

/**
 * Согласие с документами на этом экране ОБЯЗАТЕЛЬНО.
 *
 * Раньше галочка отсюда была убрана: дисклеймер онбординга (§8.1) и так
 * требует явного согласия, и спрашивать второй раз подряд казалось лишним
 * шагом. Посылка оказалась неполной — дисклеймер показывается по
 * acceptedDocsVersion, а оно хранится НА УСТРОЙСТВЕ (RootNavigator,
 * needsConsent). Второй аккаунт на том же телефоне создаётся, минуя документы
 * целиком, а App Store 5.1.1 и Google User Data привязаны к созданию
 * аккаунта, а не к установке приложения.
 *
 * Тест сторожит, чтобы согласие отсюда снова не пропало.
 */
describe('согласие с документами при регистрации', () => {
  beforeEach(() => {
    useAuthStore.setState({ busy: false, fieldErrors: {}, formError: null });
    useSettingsStore.setState({ language: 'tg' });
  });

  it('галочка и ссылка на политику есть на экране', async () => {
    const ui = await setup();

    expect(ui.getByTestId('signup-consent')).toBeTruthy();
    expect(ui.getByTestId('consent-link-privacy')).toBeTruthy();
    expect(ui.getByTestId('consent-link-terms')).toBeTruthy();
  });

  it('без галочки форма не уходит, даже когда все поля верные', async () => {
    const signUp = jest.fn(async () => {});
    useAuthStore.setState({ signUp });

    const ui = await setup();
    await fill(ui, { fullname: 'Далер', email: 'test@zehn.ai', password: 'Parol12345' });
    await fireEvent.press(ui.getByTestId('signup-submit'));

    expect(signUp).not.toHaveBeenCalled();
    expect(ui.getByText('Барои сабти ном бо шартҳо розӣ шавед')).toBeTruthy();
  });

  it('с галочкой регистрация проходит', async () => {
    const signUp = jest.fn(async () => {});
    useAuthStore.setState({ signUp });

    const ui = await setup();
    await fill(ui, { fullname: 'Далер', email: 'test@zehn.ai', password: 'Parol12345' });
    await accept(ui);
    await fireEvent.press(ui.getByTestId('signup-submit'));

    expect(signUp).toHaveBeenCalled();
  });

  it('ошибка согласия пропадает, как только галочку поставили', async () => {
    const ui = await setup();
    await fireEvent.press(ui.getByTestId('signup-submit'));
    expect(ui.getByText('Барои сабти ном бо шартҳо розӣ шавед')).toBeTruthy();

    await accept(ui);
    expect(ui.queryByText('Барои сабти ном бо шартҳо розӣ шавед')).toBeNull();
  });

  it('политика открывается вшитым окном, без сети', async () => {
    const ui = await setup();
    expect(ui.queryByTestId('legal-modal')).toBeNull();

    await fireEvent.press(ui.getByTestId('consent-link-privacy'));

    // Текст берётся из privacyPolicy.ts, а не тянется по сети (§10).
    expect(ui.getByTestId('legal-modal')).toBeTruthy();
  });
});
