import type { ApiError } from '../../api/errors';

/**
 * Ошибка запроса к модели → строка для ленты чата (§8.7).
 *
 * ПОЧЕМУ ОТДЕЛЬНО ОТ messageKeyFor. Общий разбор ошибок (api/errors.ts) на
 * 5xx говорит «Сервер дастрас нест» — и для входа это правда: не отвечает
 * бэкенд целиком. Но в чате тот же код означает другое: бэкенд-то ответил, а
 * вот движок за ним не отдал генерацию. Человеку, который ждёт ответа на свой
 * вопрос, «сервер недоступен» ничего не объясняет — он видит рабочее
 * приложение, рабочий список чатов и молчание в ответ.
 *
 * Поэтому на пути генерации 5xx получает свой текст: модель не отвечает, идут
 * работы, попробуйте позже. §8.7 требует «три различимых состояния ошибки, а
 * не одно „Ошибка“» — здесь тот же принцип доведён до конца: различаются не
 * коды, а причины, которые человек может как-то осмыслить.
 */
export function chatErrorKey(kind: ApiError['kind']): string {
  switch (kind) {
    case 'offline':
      return 'errors.offline';
    case 'timeout':
      return 'errors.slow';
    case 'server':
      // Не 'errors.serverDown' — см. комментарий выше.
      return 'errors.modelUnavailable';
    case 'unauthorized':
      return 'errors.needSignIn';
    case 'limit':
      return 'errors.limitReached';
    default:
      return 'errors.genericError';
  }
}
