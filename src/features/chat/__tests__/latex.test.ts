import { describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import { hasLatex, parseLatex } from '../latex';

/**
 * §7.6 объявляет LaTeX обязательным: модель отвечает по физике и математике.
 * Границы формул — самое хрупкое место, поэтому проверяются отдельно от
 * рендера.
 */

describe('parseLatex — строчные формулы', () => {
  it('выделяет $...$ и оставляет текст вокруг', () => {
    expect(parseLatex('Энергия $E = mc^2$ известна')).toEqual([
      { type: 'text', value: 'Энергия ' },
      { type: 'math', value: 'E = mc^2', display: false },
      { type: 'text', value: ' известна' },
    ]);
  });

  it('понимает форму \\(...\\)', () => {
    expect(parseLatex('До \\(x^2\\) после')).toEqual([
      { type: 'text', value: 'До ' },
      { type: 'math', value: 'x^2', display: false },
      { type: 'text', value: ' после' },
    ]);
  });

  it('находит несколько формул в одной строке', () => {
    const result = parseLatex('$a$ и $b$');
    expect(result.filter((s) => s.type === 'math')).toHaveLength(2);
  });
});

describe('parseLatex — блочные формулы', () => {
  it('выделяет $$...$$ как display', () => {
    expect(parseLatex('$$E_p = mgh$$')).toEqual([
      { type: 'math', value: 'E_p = mgh', display: true },
    ]);
  });

  it('понимает форму \\[...\\]', () => {
    expect(parseLatex('\\[x = 1\\]')).toEqual([{ type: 'math', value: 'x = 1', display: true }]);
  });

  /**
   * Порядок разделителей критичен: если $ проверяется раньше $$, блочная
   * формула распадётся на две пустых строчных и потеряет содержимое.
   */
  it('$$ имеет приоритет над $ — блок не распадается на две строчных', () => {
    const result = parseLatex('$$a + b$$');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'math', value: 'a + b', display: true });
  });

  it('различает блочную и строчную в одном тексте', () => {
    const result = parseLatex('строчная $x$ и блочная $$y$$');
    const math = result.filter((s): s is Extract<typeof s, { type: 'math' }> => s.type === 'math');
    expect(math.map((m) => m.display)).toEqual([false, true]);
  });
});

describe('parseLatex — устойчивость', () => {
  /**
   * Во время стриминга формула регулярно приходит наполовину. Терять из-за
   * этого хвост ответа нельзя — незакрытая формула считается текстом.
   */
  it('незакрытая формула остаётся текстом, а не съедает остаток', () => {
    expect(parseLatex('начало $E = mc^2 без закрытия')).toEqual([
      { type: 'text', value: 'начало $E = mc^2 без закрытия' },
    ]);
  });

  it('экранированный доллар — это валюта, а не формула', () => {
    expect(parseLatex('цена 5\\$ и 10\\$')).toEqual([{ type: 'text', value: 'цена 5$ и 10$' }]);
  });

  it('пустые разделители формулой не считаются', () => {
    expect(parseLatex('$$ $$')).toEqual([{ type: 'text', value: '$$ $$' }]);
    expect(parseLatex('$$')).toEqual([{ type: 'text', value: '$$' }]);
  });

  it('текст без формул возвращается одним куском', () => {
    expect(parseLatex('Просто текст')).toEqual([{ type: 'text', value: 'Просто текст' }]);
  });

  it('пустая строка даёт пустой результат', () => {
    expect(parseLatex('')).toEqual([]);
  });

  it('не ломается на таджикском тексте с формулой', () => {
    const result = parseLatex('Формулаи энергия: $E = mc^2$ мебошад.');
    expect(result[0]).toEqual({ type: 'text', value: 'Формулаи энергия: ' });
    expect(result[2]).toEqual({ type: 'text', value: ' мебошад.' });
  });

  it('многострочная блочная формула сохраняется целиком', () => {
    const result = parseLatex('$$\n  a = b \\\\\n  c = d\n$$');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('math');
  });
});

describe('hasLatex', () => {
  it('отличает текст с формулой от текста без', () => {
    expect(hasLatex('есть $x$')).toBe(true);
    expect(hasLatex('нет формул')).toBe(false);
    expect(hasLatex('цена 5\\$')).toBe(false);
  });
});
