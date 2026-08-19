/**
 * Типы контракта API (§6.3 существующие + §6.6 новые).
 *
 * Написаны вручную, а не сгенерированы openapi-typescript, по двум причинам:
 *   • половины нужных эндпоинтов в живом спеке ещё нет (B1–B6, B8, B11) —
 *     генерировать нечего;
 *   • сгенерированные типы повторяют слабости спека: у FastAPI почти всё
 *     nullable-anyOf, а нам нужен жёсткий контракт для клиента.
 *
 * Вендорная копия спека лежит в docs/openapi.json — сверяться с ней.
 *
 * ВНИМАНИЕ (§2.1): Swagger по адресу сервера инференса — это движок vLLM, а не
 * продуктовый API. Мобильный клиент к движку не обращается вообще; сам адрес
 * намеренно не упоминается в коде, потому что его наличие в бандле ловится
 * проверкой scripts/check-secrets.mjs.
 */

// ---------------------------------------------------------------------------
// Пользователь и авторизация
// ---------------------------------------------------------------------------

/** Дневные лимиты в токенах, сброс в полночь Asia/Dushanbe (§6.3.4). */
export type Tier = 'free_anon' | 'free_email' | 'plus';

export const TIER_DAILY_LIMIT: Record<Tier, number> = {
  free_anon: 3_000,
  free_email: 10_000,
  plus: 100_000,
};

export type User = {
  id: string;
  email: string;
  fullname: string;
  google_id: string | null;
  profile_img_url: string | null;
  lang: string;
  is_admin: boolean;
  is_guest: boolean;
  tier: Tier;
  created_at: string;
  updated_at: string;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
  /**
   * Аккаунт заведён этим же входом. Нужен только счётчику signup_completed
   * (§13): на клиенте регистрация через Google неотличима от возврата.
   */
  is_new_user?: boolean;
};

/**
 * Коды ошибок авторизации (§6.6 после перехода на Google).
 *
 * От почты с паролем не осталось ничего: ни занятой почты, ни неверного
 * пароля, ни кодов из письма. Обмен одноразового кода на сессию падает ровно
 * по двум причинам — код просрочен либо уже потрачен.
 */
export type AuthErrorCode = 'invalid_code' | 'expired_code';

// ---------------------------------------------------------------------------
// Чаты
// ---------------------------------------------------------------------------

export type ChatStatus = 'active' | 'archived' | 'deleted';
export type MessageRole = 'user' | 'assistant';

export type ChatInfo = {
  id: string;
  title: string;
  status: ChatStatus;
  project_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  kind: string;
  attachments: unknown[];
};

export type ChatWithMessages = Omit<ChatInfo, 'project_id'> & {
  project_id?: string | null;
  messages: ChatMessage[];
};

// ---------------------------------------------------------------------------
// Вопрос к модели
// ---------------------------------------------------------------------------

/** Класс обучения (§6.3.3, Приложение C.7). */
export type ClassLevel = 'g5_6' | 'g7' | 'g8_9' | 'g10_11' | 'simple' | 'detailed';

/**
 * Значения model и профили, в которые они разрешаются на сервере (§6.3.3).
 * Стримить сегодня умеют только light и translate: base требует полного
 * ответа для fact-check и отдаёт 409 (B9).
 */
export type ModelAlias = 'fast' | 'light' | 'smart' | 'base' | 'research' | 'translate' | 'tarjuma';
export type ModelProfile = 'light' | 'base' | 'translate';

export function profileFor(model: ModelAlias): ModelProfile {
  switch (model) {
    case 'smart':
    case 'base':
    case 'research':
      return 'base';
    case 'translate':
    case 'tarjuma':
      return 'translate';
    default:
      return 'light';
  }
}

export function isStreamable(model: ModelAlias): boolean {
  return profileFor(model) !== 'base';
}

export type AskMessage = { role: MessageRole; content: string };

export type AskRequest = {
  /** Последние 4 пары «вопрос-ответ» + новый вопрос, роли строго чередуются. */
  messages: AskMessage[];
  chat_id: string;
  temperature?: number;
  /**
   * ОБЯЗАТЕЛЬНО передавать явным false в v1.0.
   * На сервере default = true (подтверждено в docs/openapi.json), поэтому
   * забытое поле молча включит веб-поиск через Tavily, который вне объёма §1.
   */
  use_rag: boolean;
  model?: ModelAlias;
  attachment_ids?: string[] | null;
  class_level?: ClassLevel | null;
  /** B8: идемпотентность. Пока бэкенд не готов, поле просто игнорируется. */
  client_msg_id?: string;
};

export type Source = { title: string; url: string; content: string };

export type AssistantResponse = {
  response: string;
  model: ModelProfile;
  request_id: string;
  message_id: string;
  sources: Source[];
  /** B10: заголовок, сформированный сервером. Появится после реализации. */
  chat_title?: string | null;
};

export type RegenerateRequest = AskRequest & { message_id: string };

// ---------------------------------------------------------------------------
// Лимиты, обратная связь
// ---------------------------------------------------------------------------

export type Usage = {
  used: number;
  limit: number;
  remaining: number;
  resets_at: string;
  resets_at_local: string;
  resets_in_hours: number;
  approx_questions: number;
  tier: Tier;
};

// Оценка 👍/👎 и жалоба на ответ убраны из приложения по решению заказчика:
// под ответом остались только «копировать» и «перегенерировать» (см.
// src/features/chat/MessageActions.tsx). Типы FeedbackRequest / ReportCategory
// / ReportRequest удалены вместе с ними; бэкенду /v1/feedback и /v1/report не
// нужны. История — в git.

// ---------------------------------------------------------------------------
// Конфигурация клиента (B6)
// ---------------------------------------------------------------------------

export type Suggestion = { cat: string; text: string };

export type ClientConfig = {
  min_supported_version: string;
  force_update: boolean;
  update_url: string;
  default_model: ModelAlias;
  streaming_enabled: boolean;
  certificate_pinning_enabled: boolean;
  /** Тексты карточек-подсказок приходят с сервера, не зашиты в билд (§7.5). */
  suggestions: Suggestion[];
  teacher_templates: unknown[];
  limits: Partial<Record<Tier, number>>;
  // Только support: политику и условия приложение показывает встроенным
  // текстом, удаление аккаунта — через API. Веб-страницы политики и удаления
  // нужны магазинам, но их URL живут в консоли, а не в конфиге.
  links: {
    support: string;
  };
};

/**
 * Зашитый по умолчанию набор — используется, когда /v1/config недоступен
 * (§6.6: «при недоступности используется зашитый по умолчанию набор»).
 * Подсказки — эталон из Приложения C.8.
 */
export const FALLBACK_CONFIG: ClientConfig = {
  min_supported_version: '1.0.0',
  force_update: false,
  update_url: '',
  default_model: 'fast',
  streaming_enabled: true,
  certificate_pinning_enabled: true,
  suggestions: [
    { cat: 'Таърих', text: 'Дар бораи давлати Сомониён ва Исмоили Сомонӣ нақл кун' },
    { cat: 'Ҷуғрофия', text: 'Баландтарин қуллаҳои кӯҳии Тоҷикистон кадомҳоянд?' },
    { cat: 'Адабиёт', text: 'Як рубоии Рӯдакиро шарҳ дода метавонӣ?' },
    { cat: 'Сайёҳӣ', text: 'Ҷойҳои ҷолибтарин барои сайёҳон дар Помир' },
  ],
  teacher_templates: [],
  limits: { free_email: 10_000, plus: 100_000 },
  links: {
    /**
     * Поддержка — чат в Telegram. Значение по умолчанию, сервер может
     * заменить его через /v1/config без выпуска новой версии (§6.6).
     */
    support: 'https://t.me/fayzow',
  },
};
