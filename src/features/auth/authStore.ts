import { create } from 'zustand';

import { api, setUnauthorizedHandler } from '../../api';
import { authErrorCode, messageKeyFor } from '../../api/errors';
import * as authApi from '../../api/endpoints/auth';
import type { AuthSession, User } from '../../api/types';
import * as db from '../../db';
import { settingsStorage as localDataStorage } from '../../store/kv';
import { track } from '../../telemetry/events';
import { shouldWipeLocalData } from './localDataOwner';
import { secureTokenStore } from './tokenStore';
import { mapAuthErrorCode } from './validation';

/** Владелец локальной базы. Не секрет — просто id, поэтому MMKV, а не Keystore. */
const OWNER_KEY = 'db.owner.v1';

/**
 * Состояние авторизации (§8.2).
 *
 * Экраны не ходят в api/ напрямую — они дёргают эти действия и читают
 * status/fieldErrors. Так вся обработка кодов ошибок §6.6 живёт в одном месте.
 *
 * Сессия долгая: при открытии приложения повторный вход не запрашивается
 * (§6.2) — на старте пробуем восстановить пользователя по сохранённому
 * refresh-токену.
 */

export type AuthStatus = 'unknown' | 'signedOut' | 'pendingVerification' | 'signedIn';

export type AuthState = {
  status: AuthStatus;
  user: User | null;
  /** Почта, ожидающая подтверждения, — нужна экрану ввода кода. */
  pendingEmail: string | null;
  busy: boolean;
  /** Ошибка под конкретным полем (§8.2), уже как i18n-ключ. */
  fieldErrors: Partial<Record<'email' | 'password' | 'code' | 'fullname', string>>;
  /** Ошибка уровня формы, когда её не к чему привязать. */
  formError: string | null;
  /** Момент последней отправки письма — для таймера повторной отправки. */
  lastCodeSentAt: number | null;
};

export type AuthActions = {
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (params: { email: string; password: string; fullname: string; lang: string }) => Promise<void>;
  verify: (code: string) => Promise<void>;
  resend: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (params: { code: string; newPassword: string }) => Promise<void>;
  signOut: () => Promise<void>;
  clearErrors: () => void;
};

const CLEAN = {
  busy: false,
  fieldErrors: {},
  formError: null,
} satisfies Pick<AuthState, 'busy' | 'fieldErrors' | 'formError'>;

export const useAuthStore = create<AuthState & AuthActions>()((set, get) => {
  /** Общая обработка неуспеха: раскладывает ошибку по полям формы. */
  const fail = (error: Parameters<typeof messageKeyFor>[0], body?: unknown) => {
    const code = authErrorCode(body);
    const mapped = mapAuthErrorCode(code);

    if (mapped.field) {
      set({ ...CLEAN, fieldErrors: { [mapped.field]: mapped.messageKey } });
    } else {
      // Кода нет — показываем сетевую причину: нет связи / медленно / сервер.
      set({ ...CLEAN, formError: code ? mapped.messageKey : messageKeyFor(error) });
    }
  };

  /**
   * Единственная точка, через которую проходят ВСЕ успешные входы: обычный
   * вход, подтверждение почты после регистрации и сброс пароля. Поэтому
   * проверка владельца локальных данных стоит здесь — иначе её пришлось бы
   * повторять трижды и однажды забыть.
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
    set({ ...CLEAN, status: 'signedIn', user: session.user, pendingEmail: null });
  };

  return {
    status: 'unknown',
    user: null,
    pendingEmail: null,
    ...CLEAN,
    lastCodeSentAt: null,

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

    async signIn(email, password) {
      set({ ...CLEAN, busy: true });
      const result = await authApi.login(api, { email: email.trim(), password });
      if (result.ok) return succeed(result.data);

      // 403 email_not_verified — это не тупик: уводим на экран ввода кода.
      if (result.error.kind === 'validation' && result.error.status === 403) {
        set({ ...CLEAN, status: 'pendingVerification', pendingEmail: email.trim() });
        return;
      }
      fail(result.error, undefined);
      // Сообщение о неверных данных вешаем на пароль (§8.2).
      if (result.error.kind === 'unauthorized') {
        set({ ...CLEAN, fieldErrors: { password: 'authErrors.badCredentials' } });
      }
    },

    async signUp({ email, password, fullname, lang }) {
      set({ ...CLEAN, busy: true });
      // §13: считаем НАЧАТЫЕ регистрации, а не только завершённые — иначе не
      // видно, на каком шаге люди отваливаются.
      track({ name: 'signup_started' });

      const result = await authApi.register(api, {
        email: email.trim(),
        password,
        fullname: fullname.trim(),
        lang,
      });

      if (result.ok) {
        set({
          ...CLEAN,
          status: 'pendingVerification',
          pendingEmail: email.trim(),
          lastCodeSentAt: Date.now(),
        });
        return;
      }
      // 409 на регистрации — «почта уже занята» (§6.5).
      if (result.error.kind === 'validation' && result.error.status === 409) {
        set({ ...CLEAN, fieldErrors: { email: 'authErrors.emailTaken' } });
        return;
      }
      fail(result.error, undefined);
    },

    async verify(code) {
      const email = get().pendingEmail;
      if (!email) return;

      set({ ...CLEAN, busy: true });
      const result = await authApi.verifyEmail(api, { email, code: code.trim() });
      if (result.ok) {
        // Регистрация считается завершённой только после подтверждения почты:
        // до него аккаунтом пользоваться нельзя (§8.2).
        track({ name: 'signup_completed' });
        return succeed(result.data);
      }

      // 400 invalid_code / expired_code — обе под полем кода.
      set({ ...CLEAN, fieldErrors: { code: 'authErrors.invalidCode' } });
    },

    async resend() {
      const email = get().pendingEmail;
      if (!email) return;
      await authApi.resendCode(api, email);
      set({ lastCodeSentAt: Date.now() });
    },

    async forgotPassword(email) {
      set({ ...CLEAN, busy: true });
      // Сервер всегда отвечает 202, чтобы не раскрывать наличие аккаунта (§6.6),
      // поэтому успех здесь ничего не подтверждает — просто ведём дальше.
      await authApi.forgotPassword(api, email.trim());
      set({ ...CLEAN, pendingEmail: email.trim(), lastCodeSentAt: Date.now() });
    },

    async resetPassword({ code, newPassword }) {
      const email = get().pendingEmail;
      if (!email) return;

      set({ ...CLEAN, busy: true });
      const result = await authApi.resetPassword(api, {
        email,
        code: code.trim(),
        new_password: newPassword,
      });

      // Успех сразу вводит в приложение — по §8.2 после смены пароля человек
      // попадает в чат, а не обратно на экран входа.
      if (result.ok) return succeed(result.data);

      if (result.error.kind === 'validation' && result.error.status === 422) {
        set({ ...CLEAN, fieldErrors: { password: 'authErrors.passwordTooShort' } });
        return;
      }
      set({ ...CLEAN, fieldErrors: { code: 'authErrors.invalidCode' } });
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

      set({ ...CLEAN, status: 'signedOut', user: null, pendingEmail: null });
    },

    clearErrors() {
      set({ fieldErrors: {}, formError: null });
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
