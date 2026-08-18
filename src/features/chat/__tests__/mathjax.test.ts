import { beforeEach, describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import { applyColor, clearMathCache, texToSvg } from '../mathjax';

/**
 * §7.6: «LaTeX — обязательно. Модель отвечает по физике и математике».
 *
 * Главный риск здесь не в том, что формула отрисуется криво, а в том, что
 * она вообще уронит экран: содержимое приходит от модели, и проверить его
 * заранее нельзя. Поэтому половина проверок — про мусор на входе.
 */

describe('преобразование TeX в SVG', () => {
  beforeEach(() => {
    clearMathCache();
  });

  it('превращает школьную формулу в SVG с размерами', () => {
    const result = texToSvg('E = mc^2', false);
    expect(result.svg !== null).toBe(true);
    expect(result.svg!.startsWith('<svg')).toBe(true);
    expect(result.width > 0).toBe(true);
    expect(result.height > 0).toBe(true);
  });

  it('обёртка mjx-container убирается — react-native-svg её не знает', () => {
    const result = texToSvg('x^2', false);
    expect(result.svg!.includes('mjx-container')).toBe(false);
    expect(result.svg!.endsWith('</svg>')).toBe(true);
  });

  it('дробь, корень и интеграл — то, ради чего всё затевалось', () => {
    for (const tex of [
      '\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
      '\\int_0^\\infty e^{-x^2}\\,dx',
      '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}',
    ]) {
      const result = texToSvg(tex, true);
      expect(result.svg !== null).toBe(true);
    }
  });

  it('блочный и строчный режимы дают разный результат', () => {
    // display меняет размер пределов у суммы: если бы флаг игнорировался,
    // блочные формулы выглядели бы как строчные.
    const inline = texToSvg('\\sum_{i=1}^{n} i', false);
    const block = texToSvg('\\sum_{i=1}^{n} i', true);
    expect(inline.svg !== block.svg).toBe(true);
  });

  it('незнакомая команда не роняет рендер — за это отвечают noerrors и noundefined', () => {
    // Модель вполне может выдать команду из пакета, которого мы не подключили.
    const result = texToSvg('\\quantumfoo{x}', false);
    expect(result.svg !== null).toBe(true);
  });

  it('незакрытая скобка не бросает исключение', () => {
    const result = texToSvg('\\frac{1}{', false);
    // Важно не КАК отрисовано, а что вызов вернулся, а не упал.
    expect(typeof result).toBe('object');
  });

  it('пустая формула не создаёт пустой SVG', () => {
    expect(texToSvg('', false).svg).toBe(null);
    expect(texToSvg('   ', true).svg).toBe(null);
  });

  it('результат кэшируется — одна формула перерисовывается многократно', () => {
    const first = texToSvg('a+b', false);
    const second = texToSvg('a+b', false);
    // Та же строка из кэша, а не новое преобразование.
    expect(first.svg === second.svg).toBe(true);
  });

  it('кэш различает строчный и блочный режим', () => {
    const inline = texToSvg('\\lim_{x \\to 0} x', false);
    const block = texToSvg('\\lim_{x \\to 0} x', true);
    expect(inline.svg !== block.svg).toBe(true);
  });

  it('цвет подставляется вместо currentColor: каскада CSS в RN нет', () => {
    const svg = texToSvg('x', false).svg!;
    expect(svg.includes('currentColor')).toBe(true);
    const colored = applyColor(svg, '#F2ECEE');
    expect(colored.includes('currentColor')).toBe(false);
    expect(colored.includes('#F2ECEE')).toBe(true);
  });

  it('кириллица в формуле не ломает преобразование', () => {
    // Таджикские подписи внутри формул модель выдаёт регулярно.
    const result = texToSvg('\\text{суръат} = \\frac{s}{t}', true);
    expect(result.svg !== null).toBe(true);
  });
});
