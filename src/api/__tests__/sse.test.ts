import { describe, it } from 'node:test';

import { expect } from '../../test/expect';
import { SseParser, type SoroStreamEvent } from '../sse';

/** Прогоняет поток, порезанный на чанки заданного размера. */
function parseInChunks(stream: string, chunkSize: number): SoroStreamEvent[] {
  const parser = new SseParser();
  const events: SoroStreamEvent[] = [];
  for (let i = 0; i < stream.length; i += chunkSize) {
    events.push(...parser.push(stream.slice(i, i + chunkSize)));
  }
  events.push(...parser.flush());
  return events;
}

const META = 'event: meta\ndata: {"request_id":"r-1","model":"light","web_search":false}\n\n';
const DONE = 'event: done\ndata: {"message_id":"m-1","model":"light","sources":[]}\n\n';
const token = (t: string) => `event: token\ndata: ${JSON.stringify({ t })}\n\n`;

describe('SseParser', () => {
  it('разбирает канонический поток meta → token* → done', () => {
    const stream = META + token('Сал') + token('ом') + DONE;
    const events = parseInChunks(stream, stream.length);

    expect(events.map((e) => e.type)).toEqual(['meta', 'token', 'token', 'done']);
    expect(events[0]).toEqual({ type: 'meta', requestId: 'r-1', model: 'light', webSearch: false });
    expect(events[3]).toEqual({ type: 'done', messageId: 'm-1', model: 'light', sources: [] });
  });

  /**
   * Главный класс багов: запись приходит разорванной в произвольном месте.
   * Прогоняем ВСЕ размеры чанка от 1 байта — результат обязан не зависеть
   * от нарезки.
   */
  it('даёт одинаковый результат при любой нарезке на чанки', () => {
    const stream = META + token('Салом') + token(' дунё') + DONE;
    const reference = parseInChunks(stream, stream.length);

    for (let size = 1; size <= stream.length; size += 1) {
      expect(parseInChunks(stream, size), `размер чанка ${size}`).toEqual(reference);
    }
  });

  it('не теряет и не склеивает токены при посимвольной подаче', () => {
    const parts = ['Тоҷ', 'икис', 'тон'];
    const stream = META + parts.map(token).join('') + DONE;

    const text = parseInChunks(stream, 1)
      .filter((e): e is Extract<SoroStreamEvent, { type: 'token' }> => e.type === 'token')
      .map((e) => e.text)
      .join('');

    expect(text).toBe('Тоҷикистон');
  });

  it('переживает разрыв ровно посередине разделителя \\n\\n', () => {
    const parser = new SseParser();
    const first = parser.push('event: token\ndata: {"t":"а"}\n');
    expect(first).toEqual([]); // запись ещё не закрыта

    const second = parser.push('\nevent: token\ndata: {"t":"б"}\n\n');
    expect(second).toEqual([
      { type: 'token', text: 'а' },
      { type: 'token', text: 'б' },
    ]);
  });

  it('обрабатывает CRLF и не выдумывает конец записи на висящем \\r', () => {
    const parser = new SseParser();
    // Чанк заканчивается на '\r' — это может быть половина '\r\n'.
    expect(parser.push('event: token\r\ndata: {"t":"х"}\r')).toEqual([]);
    expect(parser.push('\n\r\n')).toEqual([{ type: 'token', text: 'х' }]);
  });

  it('игнорирует keep-alive комментарии от прокси', () => {
    const stream = `: ping\n\n${META}: keep-alive\n\n${token('a')}`;
    const events = parseInChunks(stream, 7);
    expect(events.map((e) => e.type)).toEqual(['meta', 'token']);
  });

  it('склеивает несколько строк data: через перевод строки, как велит спека SSE', () => {
    const parser = new SseParser();
    const events = parser.push('event: corrected\ndata: {"response":"a\\nb"}\n\n');
    expect(events).toEqual([{ type: 'corrected', response: 'a\nb' }]);
  });

  it('снимает ровно один ведущий пробел после двоеточия', () => {
    const parser = new SseParser();
    // Два пробела: второй — часть значения, поэтому JSON останется валидным.
    const events = parser.push('event: token\ndata:  {"t":"  отступ"}\n\n');
    expect(events).toEqual([{ type: 'token', text: '  отступ' }]);
  });

  it('игнорирует неизвестные типы событий вместо падения', () => {
    const stream = 'event: heartbeat\ndata: {"n":1}\n\n' + token('ок');
    expect(parseInChunks(stream, 5).map((e) => e.type)).toEqual(['token']);
  });

  it('сообщает о битом JSON, но не бросает исключение', () => {
    const parser = new SseParser();
    const events = parser.push('event: token\ndata: {"t":"обрыв\n\n');
    expect(events).toEqual([{ type: 'malformed', event: 'token', raw: '{"t":"обрыв' }]);
  });

  it('считает токен без строкового поля t сломанным контрактом', () => {
    const parser = new SseParser();
    expect(parser.push('event: token\ndata: {"text":"нет"}\n\n')).toEqual([
      { type: 'malformed', event: 'token', raw: '{"text":"нет"}' },
    ]);
  });

  it('доносит событие error и не глотает его', () => {
    const stream = META + token('нач') + 'event: error\ndata: {"message":"generation failed"}\n\n';
    const events = parseInChunks(stream, 3);
    expect(events.at(-1)).toEqual({ type: 'error', message: 'generation failed' });
  });

  it('flush() спасает последнюю запись, если поток оборвался без \\n\\n', () => {
    const parser = new SseParser();
    expect(parser.push('event: token\ndata: {"t":"хвост"}')).toEqual([]);
    expect(parser.flush()).toEqual([{ type: 'token', text: 'хвост' }]);
  });

  it('flush() на пустом буфере ничего не выдумывает', () => {
    const parser = new SseParser();
    parser.push(token('a'));
    expect(parser.flush()).toEqual([]);
  });

  it('разбирает sources, отбрасывая мусорные элементы', () => {
    const parser = new SseParser();
    const data = { sources: [{ title: 'T', url: 'U', content: 'C' }, 'мусор', { title: 'X' }] };
    const events = parser.push(`event: sources\ndata: ${JSON.stringify(data)}\n\n`);
    expect(events).toEqual([
      {
        type: 'sources',
        sources: [
          { title: 'T', url: 'U', content: 'C' },
          { title: 'X', url: '', content: '' },
        ],
      },
    ]);
  });
});
