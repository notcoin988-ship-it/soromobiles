import { describe, it } from 'node:test';

import { expect } from '../../test/expect';
import { parseSettings, serializeSettings } from '../settingsCodec';
import type { SettingsState } from '../settingsTypes';

/**
 * Настройки читаются синхронно на старте (§4.2, MMKV). Любое негодное значение
 * в хранилище обязано превратиться в значение по умолчанию, а не в исключение:
 * иначе одна испорченная запись — и приложение не открывается вообще.
 */

const DEFAULTS: SettingsState = {
  themePreference: 'dark',
  language: 'tg',
};

describe('сохранённые настройки', () => {
  it('переживают круг «сохранить — прочитать»', () => {
    const state: SettingsState = {
      themePreference: 'light',
      language: 'ru',
    };
    expect(parseSettings(serializeSettings(state), DEFAULTS)).toEqual(state);
  });

  it('пустое хранилище даёт значения по умолчанию', () => {
    expect(parseSettings(undefined, DEFAULTS)).toEqual(DEFAULTS);
    expect(parseSettings(null, DEFAULTS)).toEqual(DEFAULTS);
    expect(parseSettings('', DEFAULTS)).toEqual(DEFAULTS);
  });

  it('обрывок записи не роняет запуск', () => {
    // Так выглядит запись, прерванная убийством приложения.
    expect(parseSettings('{"themePreference":"lig', DEFAULTS)).toEqual(DEFAULTS);
  });

  it('не-объект в хранилище игнорируется', () => {
    expect(parseSettings('42', DEFAULTS)).toEqual(DEFAULTS);
    expect(parseSettings('null', DEFAULTS)).toEqual(DEFAULTS);
    expect(parseSettings('["dark"]', DEFAULTS)).toEqual(DEFAULTS);
  });

  it('незнакомое значение поля сбрасывается поодиночке, не роняя остальные', () => {
    // Настройка от будущей версии приложения при откате назад.
    const raw = '{"themePreference":"sepia","language":"en"}';
    expect(parseSettings(raw, DEFAULTS)).toEqual({
      themePreference: 'dark',
      language: 'en',
    });
  });

  it('таджикский остаётся языком по умолчанию при мусоре в поле языка', () => {
    // §9: язык по умолчанию — таджикский, независимо от языка системы.
    expect(parseSettings('{"language":"fr"}', DEFAULTS).language).toBe('tg');
  });
});
