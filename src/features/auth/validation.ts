/**
 * Валидация форм авторизации (§8.2, §6.6).
 *
 * Возвращаются i18n-ключи, а не текст: §9 запрещает строки вне i18n/.
 * Ошибки показываются под конкретным полем, а не общим алертом (§8.2), поэтому
 * функции валидируют каждое поле отдельно.
 *
 * Серверные правила дублируются здесь намеренно — чтобы не гонять заведомо
 * плохую форму по сети на медленной связи (§10). Сервер остаётся источником
 * истины: его 422 всё равно обрабатывается.
 */

/** Минимум 8 символов (§6.6). Проверку на частые пароли делает сервер. */
export const MIN_PASSWORD_LENGTH = 8;
/** Код подтверждения: 6 цифр, TTL 15 минут, максимум 5 попыток (§6.6). */
export const VERIFICATION_CODE_LENGTH = 6;
/** Таймер повторной отправки письма (§8.2). */
export const RESEND_COOLDOWN_SEC = 60;

export type FieldError = string | null;

/**
 * Проверка почты. Намеренно нестрогая: полная RFC-совместимая регулярка
 * отвергает валидные адреса и раздражает пользователей. Задача — отсечь
 * очевидные опечатки, а не подменить собой сервер.
 */
export function validateEmail(value: string): FieldError {
  const email = value.trim();
  if (!email) return 'authErrors.emailRequired';
  if (/\s/.test(email)) return 'authErrors.emailInvalid';

  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return 'authErrors.emailInvalid';

  const domain = email.slice(at + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    return 'authErrors.emailInvalid';
  }
  return null;
}

export function validatePassword(value: string): FieldError {
  if (!value) return 'authErrors.passwordRequired';
  if (value.length < MIN_PASSWORD_LENGTH) return 'authErrors.passwordTooShort';
  return null;
}

/** Имя спрашивается один раз при регистрации и больше не переспрашивается (§8.2). */
export function validateFullname(value: string): FieldError {
  if (!value.trim()) return 'authErrors.fullnameRequired';
  return null;
}

export function validateCode(value: string): FieldError {
  const code = value.trim();
  if (!code) return 'authErrors.codeRequired';
  if (!new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`).test(code)) {
    return 'authErrors.codeInvalid';
  }
  return null;
}

export type SignInForm = { email: string; password: string };
export type SignUpForm = SignInForm & { fullname: string };

export type FormErrors<T> = Partial<Record<keyof T, string>>;

export function validateSignIn(form: SignInForm): FormErrors<SignInForm> {
  const errors: FormErrors<SignInForm> = {};
  const email = validateEmail(form.email);
  if (email) errors.email = email;
  // На входе длину пароля не проверяем: у существующего аккаунта он мог быть
  // заведён по старым правилам. Пусть решает сервер — 401 bad_credentials.
  if (!form.password) errors.password = 'authErrors.passwordRequired';
  return errors;
}

export function validateSignUp(form: SignUpForm): FormErrors<SignUpForm> {
  const errors: FormErrors<SignUpForm> = {};
  const fullname = validateFullname(form.fullname);
  if (fullname) errors.fullname = fullname;
  const email = validateEmail(form.email);
  if (email) errors.email = email;
  const password = validatePassword(form.password);
  if (password) errors.password = password;
  return errors;
}

export function hasErrors<T>(errors: FormErrors<T>): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Код ошибки сервера (§6.6) → поле формы и i18n-ключ.
 * Возвращает поле, под которым показать ошибку: §8.2 требует показывать её
 * под конкретным полем, а не общим алертом.
 */
export function mapAuthErrorCode(
  code: string | null,
): { field: 'email' | 'password' | 'code' | null; messageKey: string } {
  switch (code) {
    case 'email_taken':
      return { field: 'email', messageKey: 'authErrors.emailTaken' };
    case 'bad_credentials':
      return { field: 'password', messageKey: 'authErrors.badCredentials' };
    case 'email_not_verified':
      return { field: 'email', messageKey: 'authErrors.emailNotVerified' };
    case 'invalid_code':
      return { field: 'code', messageKey: 'authErrors.invalidCode' };
    case 'expired_code':
      return { field: 'code', messageKey: 'authErrors.expiredCode' };
    case 'weak_password':
      return { field: 'password', messageKey: 'authErrors.passwordTooShort' };
    default:
      return { field: null, messageKey: 'errors.genericError' };
  }
}

/** Оставшиеся секунды таймера повторной отправки (§8.2). */
export function resendSecondsLeft(lastSentAtMs: number | null, nowMs: number): number {
  if (lastSentAtMs === null) return 0;
  const elapsed = Math.floor((nowMs - lastSentAtMs) / 1000);
  return Math.max(0, RESEND_COOLDOWN_SEC - elapsed);
}
