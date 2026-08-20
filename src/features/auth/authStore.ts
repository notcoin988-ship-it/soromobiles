import { create } from 'zustand';

import { api, setUnauthorizedHandler } from '../../api';
import { messageKeyFor } from '../../api/errors';
import * as authApi from '../../api/endpoints/auth';
import type { AuthSession, User } from '../../api/types';
import type { ThemeName } from '../../design/tokens';
import * as db from '../../db';
import { settingsStorage as localDataStorage } from '../../store/kv';
import { track } from '../../telemetry/events';
import { startGoogleSignIn } from './googleSignIn';
import { shouldWipeLocalData } from './localDataOwner';
import { secureTokenStore } from './tokenStore';

/** Владелец локальной базы. Не секрет — просто id, поэтому MMKV, а не Keystore. */
const OWNER_KEY = 'db.owner.v1';

/**
 * Состояние авторизации (§8.2 в редакции после перехода на Google).
 *
 * Вход один: «Идома бо Google». Ни форм, ни кодов из письма, ни сброса
 * пароля — вместе с ними из стора ушли pendingEmail, fieldErrors и таймер
 * повторной отправки. Осталось два исхода: вошли либо не вошли.
 *
 * Сессия долгая: при открытии приложения повторный вход не запрашивается
 * (§6.2) — на старте пробуем восстановить пользователя по сохранённому
 * refresh-токену.
 */

export type AuthStatus = 'unknown' | 'signedOut' | 'signedIn';

export type AuthState = {
  status: AuthStatus;
  user: User | null;
  busy: boolean;
  /** Ошибка входа как i18n-ключ. Поля формы, под которое её вешать, больше нет. */
  formError: string | null;
};

export type AuthActions = {
  restore: () => Promise<void>;
  /** Тема нужна встроенному браузеру: его панель красится в цвета приложения. */
  signInWithGoogle: (themeName: ThemeName) => Promise<void>;
  signOut: () => Promise<void>;
  clearErrors: () => void;
};

const CLEAN = {
  busy: false,
  formError: null,
} satisfies Pick<AuthState, 'busy' | 'formError'>;

export const useAuthStore = create<AuthState & AuthActions>()((set) => {
  /**
   * Единственная точка, через которую проходит успешный вход. Проверка
   * владельца локальных данных стоит здесь, а не в экране: чужая переписка на
   * устройстве — это утечка (§11), и полагаться на то, что её не забудут
   * позвать, нельзя.
   */
  const succeed = async (session: AuthSession) => {
    const previousOwner = localDataStorage.getString(OWNER_KEY) ?? null;

    if (shouldWipeLocalData(previousOwner, session.user.id)) {
      try {
        // ДО того, как статус станет signedIn: иначе список диалогов успеет
        // отрисоваться с чужими чатами, и человек их увидит (§11).
        await db.clearAll();
        // Владелец записывается ТОЛЬКО после удачной очистки: если база не
        // открылась, следующий вход обязан попробовать снова.
        localDataStorage.set(OWNER_KEY, session.user.id);
      } catch {
        // Не пустить человека в приложение из-за этого нельзя.
      }
    }

    void secureTokenStore.save(session);
    set({ ...CLEAN, status: 'signedIn', user: session.user });
  };

  return {
    status: 'unknown',
    user: null,
    ...CLEAN,

    async restore() {
      // Долгая сессия (§6.2): при живом refresh-токене клиент сам продлит
      // access при первом же 401, поэтому просто пробуем получить профиль.
      const result = await authApi.getMe(api);
      if (result.ok) {
        set({ status: 'signedIn', user: result.data });
      } else {
        set({ status: 'signedOut', user: null });
      }
    },

    async signInWithGoogle(themeName) {
      set({ ...CLEAN, busy: true });

      /**
       * §13: считаем НАЧАТЫЕ входы, а не только завершённые — иначе не видно,
       * сколько людей закрывает окно Google, не дойдя до конца. Отличить
       * здесь регистрацию от возврата невозможно: это знает только сервер,
       * поэтому signup_completed отправляется ниже по его ответу.
       */
      track({ name: 'signup_started' });

      const auth = await startGoogleSignIn(themeName);

      if (!auth.ok) {
        /**
         * Три исхода, и путать их нельзя. Закрыл окно сам — не ошибка, плашки
         * нет. Нет ни сервисов Google, ни браузера — причина не в человеке и
         * не в связи, общее «попробуйте ещё раз» тут только злит. Остальное —
         * общая ошибка входа.
         */
        const messageFor = {
          cancelled: null,
          unavailable: 'authErrors.googleUnavailable',
          failed: 'authErrors.googleFailed',
        } as const;

        set({ ...CLEAN, formError: messageFor[auth.reason] });
        return;
      }

      // Оба пути — системное окно и браузер — приносят id_token от Google,
      // поэтому ручка одна.
      const result = await authApi.signInWithGoogleIdToken(api, auth.idToken);

      if (result.ok) {
        // Новый аккаунт заводится молча, без отдельного экрана регистрации:
        // признак приходит с сервера, потому что на клиенте вход и первая
        // регистрация выглядят одинаково.
        if (result.data.is_new_user) track({ name: 'signup_completed' });
        return succeed(result.data);
      }

      /**
       * Просроченный или уже использованный код — это ЧУЖАЯ ошибка только на
       * вид: чаще всего человек слишком долго держал окно открытым. Сетевую
       * причину (нет связи, медленно, сервер лежит) показываем как есть,
       * остальное — общей просьбой попробовать ещё раз.
       */
      const networkKind =
        result.error.kind === 'offline' ||
        result.error.kind === 'timeout' ||
        result.error.kind === 'server';

      set({
        ...CLEAN,
        formError: networkKind ? messageKeyFor(result.error) : 'authErrors.googleFailed',
      });
    },

    async signOut() {
      const refresh = await secureTokenStore.getRefresh();
      if (refresh) await authApi.logout(api, refresh);
      await secureTokenStore.clear();

      /**
       * Локальная история стирается вместе с сессией (§11).
       *
       * Цена — офлайн-история пропадает до следующего входа с сетью, и вместе
       * с ней уходит неотправленная очередь. Это осознанно: очередь §5.5
       * принадлежит сессии, и доставлять её потом под чужим токеном нельзя —
       * сообщение ушло бы в другой аккаунт.
       *
       * Ошибку глушим: не выйти из аккаунта из-за неудавшейся очистки нельзя,
       * а владелец при этом остаётся записанным, и проверка при следующем
       * входе доделает работу.
       */
      try {
        await db.clearAll();
        localDataStorage.remove(OWNER_KEY);
      } catch {
        // Останется на следующий вход — там сверка владельца всё равно есть.
      }

      set({ ...CLEAN, status: 'signedOut', user: null });
    },

    clearErrors() {
      set({ formError: null });
    },
  };
});

/**
 * Провал рефреша означает полный логаут (§5.3). Регистрируем обработчик один
 * раз при загрузке модуля: api/ не должен знать про стор, а стор — про api/.
 */
setUnauthorizedHandler(() => {
  void secureTokenStore.clear();
  useAuthStore.setState({ status: 'signedOut', user: null });
});
