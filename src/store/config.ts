import { Platform } from 'react-native';
import { create } from 'zustand';

import { api } from '../api';
import { compareVersions, fetchConfig, needsForcedUpdate } from '../api/endpoints/misc';
import { FALLBACK_CONFIG, type ClientConfig } from '../api/types';
import { useSettingsStore } from './settings';

/**
 * Конфигурация клиента с сервера (B6, §6.6).
 *
 * «Запрашивается при каждом холодном старте, кэшируется на 24 часа, при
 * недоступности используется зашитый по умолчанию набор».
 *
 * Смысл в том, чтобы ссылки на документы, тексты подсказок и минимальную
 * версию можно было менять БЕЗ релиза в магазин. Зашитые ссылки — это
 * гарантированный простой: битая ссылка на политику конфиденциальности
 * чинится только новой версией и днями ревью, а всё это время приложение
 * нарушает требования магазина.
 */

export const CONFIG_TTL_MS = 24 * 60 * 60 * 1000;

/** Версия приложения. ЗАМЕНИТЬ на чтение из expo-constants при сборке релиза. */
export const APP_VERSION = '1.0.0';

export type ConfigState = {
  config: ClientConfig;
  /** true, пока не пришёл ответ сервера: показываются зашитые значения. */
  isFallback: boolean;
  fetchedAt: number | null;
  /** Версия ниже min_supported_version либо force_update — блокирующий экран. */
  updateRequired: boolean;
};

export type ConfigActions = {
  load: (force?: boolean) => Promise<void>;
};

export const useConfigStore = create<ConfigState & ConfigActions>()((set, get) => ({
  config: FALLBACK_CONFIG,
  isFallback: true,
  fetchedAt: null,
  updateRequired: false,

  async load(force = false) {
    const { fetchedAt } = get();

    // Кэш на 24 часа (§6.6): дёргать конфиг на каждый переход по экранам
    // незачем, а на 3G это лишняя задержка.
    if (!force && fetchedAt !== null && Date.now() - fetchedAt < CONFIG_TTL_MS) return;

    // fetchConfig никогда не бросает и не возвращает ошибку: при
    // недоступности отдаёт зашитый набор. Падение этой ручки НЕ должно
    // блокировать вход в продукт.
    /**
     * Язык берётся из настроек, а НЕ зашивается.
     *
     * Здесь стояло 'tg' константой, и это было видно на экране: человек
     * переключал интерфейс на русский, а карточки-подсказки оставались
     * таджикскими — их тексты приходят с сервера (§7.5), и сервер отдавал
     * ровно то, что мы просили.
     */
    const config = await fetchConfig(api, {
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      version: APP_VERSION,
      lang: useSettingsStore.getState().language,
    });

    // Отличаем реальный ответ от фолбэка: у зашитого набора update_url пуст.
    const fromServer = config.update_url !== FALLBACK_CONFIG.update_url || config.suggestions !== FALLBACK_CONFIG.suggestions;

    set({
      config,
      isFallback: !fromServer,
      fetchedAt: Date.now(),
      updateRequired: needsForcedUpdate(config, APP_VERSION),
    });
  },
}));

/** Ссылки на документы. Приходят с сервера, чтобы менять их без релиза. */
export function useLinks(): ClientConfig['links'] {
  return useConfigStore((s) => s.config.links);
}

/** Карточки-подсказки. §7.5: тексты приходят с сервера, не зашиты в билд. */
export function useSuggestions(): ClientConfig['suggestions'] {
  return useConfigStore((s) => s.config.suggestions);
}

export { compareVersions };
