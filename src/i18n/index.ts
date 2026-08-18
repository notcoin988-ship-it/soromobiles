import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { DEFAULT_LANGUAGE, type Language } from './languages';
import en from './en.json';
import ru from './ru.json';
import tg from './tg.json';

/**
 * Локализация (§9).
 *
 * Язык по умолчанию — таджикский, НЕЗАВИСИМО от языка системы. Это не
 * упущение, а требование: аудитория — таджикоязычные школы, и телефон у
 * учителя чаще всего русский или английский по системным настройкам.
 *
 * Смена языка перерисовывает интерфейс без перезапуска приложения.
 */

// Сам список — в languages.ts: он нужен модулям без react-i18next (см. там).
export { DEFAULT_LANGUAGE, LANGUAGES, type Language } from './languages';

export const resources = {
  tg: { translation: tg },
  ru: { translation: ru },
  en: { translation: en },
} as const;

let initialized = false;

export function initI18n(language: Language = DEFAULT_LANGUAGE) {
  if (initialized) return i18n;

  void i18n.use(initReactI18next).init({
    resources,
    lng: language,
    fallbackLng: DEFAULT_LANGUAGE,
    // Ключи вида 'errors.offline' — вложенные, разделитель точкой.
    keySeparator: '.',
    nsSeparator: false,
    interpolation: {
      // React сам экранирует вывод; двойное экранирование ломает кавычки
      // в таджикских строках вида «Спам»-ро.
      escapeValue: false,
    },
    returnNull: false,
  });

  initialized = true;
  return i18n;
}

export function changeLanguage(language: Language): void {
  void i18n.changeLanguage(language);
}

/**
 * Форматирование даты по локали (§9). Часовой пояс лимитов — всегда
 * Asia/Dushanbe, независимо от зоны устройства (§6.3.4).
 */
export const LIMITS_TIMEZONE = 'Asia/Dushanbe';

export function formatDate(value: Date | string | number, language: Language): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  // Таджикская локаль в Intl поддержана не везде — для tg падаем на ru,
  // у них совпадают кириллица и порядок компонентов даты.
  const locale = language === 'tg' ? 'ru-RU' : language === 'ru' ? 'ru-RU' : 'en-US';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

export default i18n;
