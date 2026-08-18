import { describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import { parseLegalConsent } from '../legalConsent';
import en from '../../../i18n/en.json';
import ru from '../../../i18n/ru.json';
import tg from '../../../i18n/tg.json';

/**
 * Строка согласия под формой регистрации (§8.2).
 *
 * Главная проверка здесь — последняя: все три словаря размечены одинаково.
 * Ссылка на политику существует только потому, что в строке стоят теги, и
 * потерять их при переводе проще всего: переводчик видит обычное предложение
 * и правит его целиком. Без тега «Сиёсати махфият» останется простым текстом,
 * документ станет недостижим с экрана регистрации — а его доступность до
 * создания аккаунта требуют и App Store 5.1.1, и Google User Data.
 */

const dictionaries = [
  { language: 'tg', consent: tg.auth.legalConsent },
  { language: 'ru', consent: ru.auth.legalConsent },
  { language: 'en', consent: en.auth.legalConsent },
];

describe('строка согласия (§8.2)', () => {
  it('строка без разметки остаётся одним куском текста', () => {
    expect(parseLegalConsent('Бо идома додан розӣ мешавед.')).toEqual([
      { kind: 'text', text: 'Бо идома додан розӣ мешавед.' },
    ]);
  });

  it('режет предложение на текст и ссылки, сохраняя порядок', () => {
    expect(parseLegalConsent('до <terms>Т</terms> и <privacy>П</privacy> после')).toEqual([
      { kind: 'text', text: 'до ' },
      { kind: 'link', name: 'terms', text: 'Т' },
      { kind: 'text', text: ' и ' },
      { kind: 'link', name: 'privacy', text: 'П' },
      { kind: 'text', text: ' после' },
    ]);
  });

  it('непарный тег остаётся текстом, а не съедает остаток строки', () => {
    // Опечатка в словаре не имеет права оставить человека без предложения:
    // ссылка не откроется, но текст согласия он прочитает.
    const segments = parseLegalConsent('до <terms>Т и <privacy>П</privacy>');

    expect(segments.map((s) => s.kind).join(',')).toBe('text,link');
    expect(segments.map((s) => ('text' in s ? s.text : '')).join('')).toBe('до <terms>Т и П');
  });

  it('повторный разбор той же строки даёт тот же результат', () => {
    // Регулярка объявлена с флагом g на уровне модуля и хранит lastIndex между
    // вызовами. Без сброса второй рендер экрана потерял бы первую ссылку.
    const source = 'до <terms>Т</terms> и <privacy>П</privacy>';
    expect(parseLegalConsent(source)).toEqual(parseLegalConsent(source));
  });

  for (const { language, consent } of dictionaries) {
    it(`словарь ${language}: обе ссылки размечены и текст не потерян`, () => {
      const segments = parseLegalConsent(consent);
      const links = segments.filter((s) => s.kind === 'link');

      expect(links).toHaveLength(2);
      expect(links.map((s) => (s.kind === 'link' ? s.name : '')).join(',')).toBe('terms,privacy');
      // Названия документов непустые — иначе ссылка есть, а нажимать не на что.
      expect(links.every((s) => 'text' in s && s.text.trim().length > 0)).toBe(true);

      // Склейка сегментов возвращает исходное предложение без тегов: значит,
      // разбор ничего не выбросил и не переставил.
      const rendered = segments.map((s) => ('text' in s ? s.text : '')).join('');
      expect(rendered).toBe(consent.replace(/<\/?(terms|privacy)>/g, ''));
      expect(rendered.includes('<')).toBe(false);
    });
  }
});
