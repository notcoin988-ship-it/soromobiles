import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MessageActions } from '../MessageActions';

/**
 * Ряд действий под ответом.
 *
 * Раньше здесь было шесть кнопок: копировать, «Объясни проще», перегенерация,
 * 👍, 👎 и жалоба. По решению заказчика остались две — копирование и
 * перегенерация, — и вместе с оценкой и жалобой отпали критерий §17 «оценка и
 * жалоба работают» и задача бэкенда B11.
 *
 * Тест сторожит именно это: считает кнопки целиком. Вернётся лишняя — упадёт,
 * пропадёт нужная — тоже. Список действий над ответом уже один раз молча
 * обрезался на устройстве (Android рисует в системном Alert только три
 * кнопки), и с тех пор он под счётом.
 */

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderActions = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <MessageActions messageId="m1" content="Ҷавоб" onRegenerate={jest.fn()} />
    </SafeAreaProvider>,
  );

describe('действия под ответом', () => {
  it('ровно две кнопки: копировать и переспросить', async () => {
    const ui = await renderActions();

    expect(ui.getByLabelText('Нусха')).toBeTruthy();
    expect(ui.getByLabelText('Аз нав')).toBeTruthy();
    expect(ui.getAllByRole('button')).toHaveLength(2);
  });

  it('оценки и жалобы под ответом больше нет', async () => {
    // Проверяем по подписям доступности: именно их читает программа чтения с
    // экрана, и именно они остались бы, вернись кнопки случайно.
    const ui = await renderActions();

    expect(ui.queryByLabelText('Хуб')).toBeNull();
    expect(ui.queryByLabelText('Бад')).toBeNull();
    expect(ui.queryByLabelText('Шикоят')).toBeNull();
    expect(ui.queryByLabelText('Соддатар шарҳ деҳ')).toBeNull();
  });

  it('перегенерация вызывает переданный обработчик', async () => {
    const onRegenerate = jest.fn();
    const ui = await render(
      <SafeAreaProvider initialMetrics={METRICS}>
        <MessageActions messageId="m1" content="Ҷавоб" onRegenerate={onRegenerate} />
      </SafeAreaProvider>,
    );

    await fireEvent.press(ui.getByLabelText('Аз нав'));

    expect(onRegenerate).toHaveBeenCalled();
  });
});
