/**
 * Инкрементальный парсер SSE-потока POST /v2/ask/stream (§6.4).
 *
 * Транспортно-независим намеренно: принимает строковые чанки от чего угодно —
 * expo/fetch (настоящий ReadableStream) или react-native-sse (XHR). §5.4
 * оставляет выбор транспорта открытым, и подменить его не должно стоить
 * переписывания разбора.
 *
 * Что важно и что чаще всего ломается в наивных реализациях:
 *   • запись может быть разорвана по границе чанка в любом месте, включая
 *     середину слова «event», середину JSON и середину разделителя \n\n;
 *   • по спецификации SSE несколько строк `data:` в одной записи склеиваются
 *     через \n;
 *   • строки, начинающиеся с `:`, — это keep-alive комментарии, их шлют прокси;
 *   • неизвестные типы событий надо игнорировать, а не падать: сервер может
 *     добавить событие (например `corrected` из B9) раньше, чем клиент обновят.
 */

export type Source = { title: string; url: string; content: string };

export type SoroStreamEvent =
  | { type: 'meta'; requestId: string | null; model: string | null; webSearch: boolean }
  /** v1.0: игнорируется — веб-поиск вне объёма (§6.4). */
  | { type: 'sources'; sources: Source[] }
  | { type: 'token'; text: string }
  | { type: 'done'; messageId: string | null; model: string | null; sources: Source[] }
  /** B9: fact-check прислал исправленный полный текст — заменить содержимое. */
  | { type: 'corrected'; response: string }
  | { type: 'error'; message: string }
  /** Данные пришли, но не разобрались. Не бросаем исключение — пишем в Sentry. */
  | { type: 'malformed'; event: string; raw: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asSources(v: unknown): Source[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord).map((s) => ({
    title: asString(s.title) ?? '',
    url: asString(s.url) ?? '',
    content: asString(s.content) ?? '',
  }));
}

export class SseParser {
  /** Незавершённый хвост: либо неполная запись, либо висящий '\r'. */
  private buf = '';

  /** Скармливает очередной чанк и возвращает все полностью собранные события. */
  push(chunk: string): SoroStreamEvent[] {
    this.buf += chunk;

    // Одиночный '\r' в конце может оказаться первой половиной '\r\n' —
    // нормализовать его сейчас значит выдумать конец записи. Придерживаем.
    let held = '';
    let workable = this.buf;
    if (workable.endsWith('\r')) {
      held = '\r';
      workable = workable.slice(0, -1);
    }

    workable = workable.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const records = workable.split('\n\n');
    // Последний фрагмент — либо пустая строка (поток кончился на разделителе),
    // либо начало ещё не доехавшей записи. В обоих случаях он остаётся в буфере.
    this.buf = (records.pop() ?? '') + held;

    const out: SoroStreamEvent[] = [];
    for (const record of records) {
      const parsed = this.parseRecord(record);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  /**
   * Досбор в конце потока. Сервер обязан закрывать запись через \n\n, но если
   * соединение оборвалось на последней записи без разделителя — не терять её.
   */
  flush(): SoroStreamEvent[] {
    const tail = this.buf.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.buf = '';
    const parsed = tail.trim() ? this.parseRecord(tail) : null;
    return parsed ? [parsed] : [];
  }

  private parseRecord(raw: string): SoroStreamEvent | null {
    let eventName = '';
    const dataLines: string[] = [];

    for (const line of raw.split('\n')) {
      if (line === '' || line.startsWith(':')) continue; // keep-alive / пустая

      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      // По спецификации снимается ровно один ведущий пробел, не все.
      if (value.startsWith(' ')) value = value.slice(1);

      if (field === 'event') eventName = value.trim();
      else if (field === 'data') dataLines.push(value);
      // id / retry и любые другие поля нам не нужны.
    }

    if (!eventName && dataLines.length === 0) return null;

    const rawData = dataLines.join('\n');

    let payload: unknown;
    if (rawData !== '') {
      try {
        payload = JSON.parse(rawData);
      } catch {
        return { type: 'malformed', event: eventName, raw: rawData };
      }
    }

    return this.toEvent(eventName, payload, rawData);
  }

  private toEvent(eventName: string, payload: unknown, rawData: string): SoroStreamEvent | null {
    const p = isRecord(payload) ? payload : {};

    switch (eventName) {
      case 'meta':
        return {
          type: 'meta',
          requestId: asString(p.request_id),
          model: asString(p.model),
          webSearch: p.web_search === true,
        };

      case 'sources':
        return { type: 'sources', sources: asSources(p.sources) };

      case 'token': {
        const text = asString(p.t);
        // Токен без строкового `t` — это не «пустой токен», а сломанный контракт.
        if (text === null) return { type: 'malformed', event: eventName, raw: rawData };
        return { type: 'token', text };
      }

      case 'done':
        return {
          type: 'done',
          messageId: asString(p.message_id),
          model: asString(p.model),
          sources: asSources(p.sources),
        };

      case 'corrected': {
        const response = asString(p.response);
        if (response === null) return { type: 'malformed', event: eventName, raw: rawData };
        return { type: 'corrected', response };
      }

      case 'error':
        // Сервер уже записал в историю извинение «Бубахшед, ҳангоми коркард
        // хатогӣ рӯй дод.» — своим текстом не дублировать (§6.4).
        return { type: 'error', message: asString(p.message) ?? '' };

      default:
        return null; // неизвестное событие — молча пропускаем
    }
  }
}
