import { create } from 'zustand';

import { LEGAL_DOCS_VERSION } from '../features/legal/consent';
import { ONBOARDING_KEY, settingsStorage } from './kv';

/**
 * Состояние первого запуска (§8.1).
 *
 * Два независимых факта, и это намеренно:
 *
 * • `languageChosen` — язык выбрали хотя бы раз. Экран выбора показывается
 *   ТОЛЬКО на первом запуске: §8.1 разрешает «три экрана максимум», и
 *   гонять человека через выбор языка после каждого обновления документов
 *   было бы издевательством. Дальше язык меняется в настройках (§8.5).
 *
 * • `acceptedDocsVersion` — с какой редакцией документов согласились. Именно
 *   версия, а не «да/нет»: ТЗ требует показать дисклеймер повторно, когда
 *   документы изменятся.
 *
 * Читается СИНХРОННО при импорте, как и настройки: асинхронное чтение дало бы
 * вспышку экрана входа тому, кто онбординг уже прошёл.
 */

export type OnboardingState = {
  languageChosen: boolean;
  acceptedDocsVersion: string | null;
};

export type OnboardingActions = {
  /** Язык выбран на первом экране — больше не спрашиваем. */
  markLanguageChosen: () => void;
  /** Согласие с текущей редакцией документов. */
  acceptDocs: () => void;
};

const DEFAULT_STATE: OnboardingState = {
  languageChosen: false,
  acceptedDocsVersion: null,
};

/**
 * Разбор сохранённого. Испорченное хранилище не должно мешать запуску: в
 * худшем случае человек пройдёт онбординг ещё раз — это неприятно, но
 * работает, в отличие от падения на старте.
 */
function load(): OnboardingState {
  try {
    const raw = settingsStorage.getString(ONBOARDING_KEY);
    if (!raw) return DEFAULT_STATE;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_STATE;

    const record = parsed as Partial<OnboardingState>;
    return {
      languageChosen: record.languageChosen === true,
      acceptedDocsVersion:
        typeof record.acceptedDocsVersion === 'string' ? record.acceptedDocsVersion : null,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

function save(state: OnboardingState): void {
  try {
    settingsStorage.set(ONBOARDING_KEY, JSON.stringify(state));
  } catch {
    // Не сохранилось — онбординг повторится при следующем запуске. Ронять
    // приложение из-за этого нельзя.
  }
}

export const useOnboardingStore = create<OnboardingState & OnboardingActions>()((set, get) => {
  const persist = () => save({ ...get() });

  return {
    ...load(),

    markLanguageChosen: () => {
      set({ languageChosen: true });
      persist();
    },

    acceptDocs: () => {
      set({ acceptedDocsVersion: LEGAL_DOCS_VERSION });
      persist();
    },
  };
});
