import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ChooseLanguageScreen from '../ChooseLanguageScreen';
import DisclaimerScreen from '../DisclaimerScreen';
import { useSettingsStore } from '../../../store/settings';

/**
 * Первый запуск (§8.1).
 *
 * Три вещи, ради которых написан тест:
 *
 * 1. таджикский предвыбран — §9 требует его независимо от языка системы, и
 *    сломать это можно незаметно, поменяв умолчание в настройках;
 * 2. дисклеймер не пройти без согласия. Это не UX-придирка: §3.1 и оба
 *    магазина требуют принятия документов ДО создания аккаунта, а проверить
 *    глазами «кнопка неактивна» на ревью никто не успеет;
 * 3. кнопка «Идома» на экране языка активна СРАЗУ — человеку, которому нужен
 *    таджикский, хватает одного тапа, и три тапа до входа из §8.1 сходятся.
 */

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const wrap = (node: React.ReactElement) =>
  render(<SafeAreaProvider initialMetrics={METRICS}>{node}</SafeAreaProvider>);

describe('онбординг: выбор языка', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'tg' });
  });

  it('таджикский предвыбран, продолжить можно сразу', async () => {
    const onContinue = jest.fn();
    const ui = await wrap(<ChooseLanguageScreen onContinue={onContinue} />);

    expect(ui.getByTestId('onboarding-language-tg').props.accessibilityState.selected).toBe(true);

    await fireEvent.press(ui.getByTestId('onboarding-language-continue'));
    expect(onContinue).toHaveBeenCalled();
  });

  it('названия языков написаны на самих языках', async () => {
    // Иначе выбрать нужный сможет только тот, кто уже понимает текущий.
    const ui = await wrap(<ChooseLanguageScreen onContinue={jest.fn()} />);

    expect(ui.getByText('Тоҷикӣ')).toBeTruthy();
    expect(ui.getByText('Русский')).toBeTruthy();
    expect(ui.getByText('English')).toBeTruthy();
  });
});

describe('онбординг: дисклеймер', () => {
  beforeEach(() => {
    useSettingsStore.setState({ language: 'tg' });
  });

  it('предупреждение об ошибках модели показано', async () => {
    const ui = await wrap(<DisclaimerScreen onAccept={jest.fn()} />);

    expect(ui.getByText('Soro метавонад хато кунад')).toBeTruthy();
    expect(ui.getByText('Маълумоти муҳимро ҳамеша санҷед.')).toBeTruthy();
  });

  it('без согласия дальше не пускает и объясняет почему', async () => {
    const onAccept = jest.fn();
    const ui = await wrap(<DisclaimerScreen onAccept={onAccept} />);

    await fireEvent.press(ui.getByTestId('onboarding-continue'));

    expect(onAccept).not.toHaveBeenCalled();
    expect(ui.getByText('Барои сабти ном бо шартҳо розӣ шавед')).toBeTruthy();
  });

  it('с согласием пропускает дальше', async () => {
    const onAccept = jest.fn();
    const ui = await wrap(<DisclaimerScreen onAccept={onAccept} />);

    await fireEvent.press(ui.getByTestId('onboarding-consent'));
    await fireEvent.press(ui.getByTestId('onboarding-continue'));

    expect(onAccept).toHaveBeenCalled();
  });

  it('политику можно прочитать прямо здесь, без сети', async () => {
    const ui = await wrap(<DisclaimerScreen onAccept={jest.fn()} />);

    await fireEvent.press(ui.getByTestId('consent-link-privacy'));

    expect(ui.getByText('Сиёсати ҳифзи махфият – SoroLLM')).toBeTruthy();
  });
});
