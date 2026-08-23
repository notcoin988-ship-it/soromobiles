/**
 * Запасной адрес сервера (§5.3, §8.7).
 *
 * ЗАЧЕМ. 23–24 августа 2026 перестала резолвиться зона sorollm.tj: имя не
 * разрешалось ни с компьютера, ни с телефона по LTE, при этом сервер был жив и
 * отвечал по второму имени — api.sorollm.ai, тот же 52.15.101.145. Приложение
 * знало один адрес и показывало «Пайвастшавӣ суст аст…», хотя достаточно было
 * постучаться рядом.
 *
 * Оба домена уже покрыты пиннингом — и NSPinnedDomains на iOS, и
 * network_security_config на Android перечисляют api.sorollm.tj и
 * api.sorollm.ai. Переключение не ослабляет проверку сертификата.
 *
 * Здесь только ПРАВИЛО, без хранилища и без сети: так его можно прогнать
 * обычными тестами, не поднимая ни MMKV, ни NetInfo (как в connectivity.ts).
 */

export type ActiveHost = 'primary' | 'mirror';

export type FailoverState = {
  active: ActiveHost;
  /** Подряд идущие неудачи текущего адреса. Успех обнуляет. */
  failures: number;
};

/**
 * Сколько неудач подряд терпим до переключения.
 *
 * Единицы мало: на мобильной сети одиночный таймаут — обычное дело, и
 * приложение прыгало бы между доменами на ровном месте. Двух достаточно:
 * при недоступном домене идемпотентный запрос сам делает три попытки, то есть
 * переключение происходит внутри первого же обращения пользователя.
 */
export const FAILURES_BEFORE_SWITCH = 2;

/**
 * Сколько живёт выбор зеркала.
 *
 * Основной адрес предпочтителен: он в конфиге, на него настроены сертификаты и
 * мониторинг. Поэтому выбор зеркала не вечен — через сутки приложение снова
 * пробует основной. Иначе одна авария навсегда увела бы всех на запасной адрес,
 * и о том, что основной давно починили, никто бы не узнал.
 */
export const MIRROR_TTL_MS = 24 * 60 * 60 * 1000;

export const INITIAL_STATE: FailoverState = { active: 'primary', failures: 0 };

export type FailoverEvent =
  /** Ответ получен — неважно с каким кодом. Сервер на связи. */
  | 'reachable'
  /** Ответа нет: таймаут или сетевой сбой при живом интернете. */
  | 'unreachable';

export function nextState(state: FailoverState, event: FailoverEvent): FailoverState {
  if (event === 'reachable') {
    // Обнуляем счётчик, адрес не трогаем: работающий менять незачем.
    return state.failures === 0 ? state : { ...state, failures: 0 };
  }

  const failures = state.failures + 1;
  if (failures < FAILURES_BEFORE_SWITCH) return { ...state, failures };

  return {
    active: state.active === 'primary' ? 'mirror' : 'primary',
    failures: 0,
  };
}

/**
 * С какого адреса начинать после запуска приложения.
 *
 * Зеркало запоминается, иначе каждый холодный старт во время аварии снова
 * стоил бы пользователю двух неудачных запросов. Но не дольше суток — см.
 * MIRROR_TTL_MS.
 */
export function initialActive(
  saved: { active: ActiveHost; at: number } | null,
  now: number,
  ttlMs: number = MIRROR_TTL_MS,
): ActiveHost {
  if (!saved || saved.active !== 'mirror') return 'primary';
  return now - saved.at < ttlMs ? 'mirror' : 'primary';
}

/**
 * Запасной адрес по основному: домены отличаются только зоной.
 *
 * Возвращает null, если пары нет — тогда переключаться некуда, и весь механизм
 * молча выключается. Так дев-сборка против localhost не пытается ходить в
 * несуществующее зеркало.
 */
export function mirrorOf(baseUrl: string): string | null {
  if (baseUrl.includes('.sorollm.tj')) return baseUrl.replace('.sorollm.tj', '.sorollm.ai');
  if (baseUrl.includes('.sorollm.ai')) return baseUrl.replace('.sorollm.ai', '.sorollm.tj');
  return null;
}
