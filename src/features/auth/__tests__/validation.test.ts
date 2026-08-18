import { describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import {
  MIN_PASSWORD_LENGTH,
  RESEND_COOLDOWN_SEC,
  VERIFICATION_CODE_LENGTH,
  hasErrors,
  mapAuthErrorCode,
  resendSecondsLeft,
  validateCode,
  validateEmail,
  validatePassword,
  validateSignIn,
  validateSignUp,
} from '../validation';

describe('validateEmail', () => {
  for (const email of [
    'muallim@example.tj',
    'a.b+tag@sub.domain.co',
    'ном@почта.рф', // кириллица в адресе допустима
  ]) {
    it(`принимает ${email}`, () => {
      expect(validateEmail(email)).toBeNull();
    });
  }

  for (const email of ['', '   ', 'без-собаки.tj', '@example.tj', 'a@b', 'a@@b.tj', 'a b@c.tj']) {
    it(`отвергает ${JSON.stringify(email)}`, () => {
      expect(validateEmail(email)).not.toBeNull();
    });
  }

  it('не спотыкается о пробелы по краям — их обрежет отправка', () => {
    expect(validateEmail('  muallim@example.tj  ')).toBeNull();
  });

  it('различает «пусто» и «неверно» — тексты под полем разные', () => {
    expect(validateEmail('')).toBe('authErrors.emailRequired');
    expect(validateEmail('мусор')).toBe('authErrors.emailInvalid');
  });
});

describe('validatePassword', () => {
  it('минимальная длина по §6.6 — 8 символов', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it('отвергает короткий пароль', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe(
      'authErrors.passwordTooShort',
    );
  });

  it('принимает ровно 8 символов — граница включающая', () => {
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it('пустой пароль — это «обязательно», а не «коротко»', () => {
    expect(validatePassword('')).toBe('authErrors.passwordRequired');
  });
});

describe('validateCode', () => {
  it('код — ровно 6 цифр (§6.6)', () => {
    expect(VERIFICATION_CODE_LENGTH).toBe(6);
    expect(validateCode('123456')).toBeNull();
  });

  for (const code of ['12345', '1234567', '12345a', 'абвгде', '']) {
    it(`отвергает ${JSON.stringify(code)}`, () => {
      expect(validateCode(code)).not.toBeNull();
    });
  }

  it('терпит пробелы от вставки из буфера', () => {
    expect(validateCode(' 123456 ')).toBeNull();
  });
});

describe('validateSignIn', () => {
  it('чистая форма не даёт ошибок', () => {
    expect(hasErrors(validateSignIn({ email: 'a@b.tj', password: 'parol12345' }))).toBe(false);
  });

  /**
   * У существующего аккаунта пароль мог быть заведён по старым правилам —
   * на входе длину не проверяем, иначе человек не сможет войти под своим
   * же паролем. Решает сервер: 401 bad_credentials.
   */
  it('на входе НЕ отвергает короткий пароль — это решает сервер', () => {
    const errors = validateSignIn({ email: 'a@b.tj', password: '123' });
    expect(errors.password).toBeUndefined();
  });

  it('пустой пароль всё же отсекает, не гоняя запрос впустую', () => {
    expect(validateSignIn({ email: 'a@b.tj', password: '' }).password).toBe(
      'authErrors.passwordRequired',
    );
  });
});

describe('validateSignUp', () => {
  it('на регистрации короткий пароль отвергается', () => {
    const errors = validateSignUp({ fullname: 'Ном', email: 'a@b.tj', password: '123' });
    expect(errors.password).toBe('authErrors.passwordTooShort');
  });

  it('собирает ошибки по всем полям сразу, а не по первому', () => {
    const errors = validateSignUp({ fullname: '  ', email: 'мусор', password: '1' });
    expect(Object.keys(errors).sort()).toEqual(['email', 'fullname', 'password']);
  });

  it('валидная форма проходит', () => {
    const errors = validateSignUp({
      fullname: 'Муаллим Тестов',
      email: 'muallim@example.tj',
      password: 'parol12345',
    });
    expect(hasErrors(errors)).toBe(false);
  });
});

describe('mapAuthErrorCode — ошибка под нужным полем (§8.2)', () => {
  const cases = [
    ['email_taken', 'email'],
    ['bad_credentials', 'password'],
    ['email_not_verified', 'email'],
    ['invalid_code', 'code'],
    ['expired_code', 'code'],
    ['weak_password', 'password'],
  ] as const;

  for (const [code, field] of cases) {
    it(`${code} → поле ${field}`, () => {
      expect(mapAuthErrorCode(code).field).toBe(field);
    });
  }

  it('неизвестный код не привязывается к полю и даёт общее сообщение', () => {
    const mapped = mapAuthErrorCode('нечто_новое');
    expect(mapped.field).toBeNull();
    expect(mapped.messageKey).toBe('errors.genericError');
  });

  it('отсутствие кода тоже обрабатывается', () => {
    expect(mapAuthErrorCode(null).field).toBeNull();
  });
});

describe('resendSecondsLeft — таймер повторной отправки (§8.2)', () => {
  it('без отправки таймера нет', () => {
    expect(resendSecondsLeft(null, 1_000_000)).toBe(0);
  });

  it('сразу после отправки — полные 60 секунд', () => {
    expect(resendSecondsLeft(1_000_000, 1_000_000)).toBe(RESEND_COOLDOWN_SEC);
  });

  it('через 25 секунд остаётся 35', () => {
    expect(resendSecondsLeft(1_000_000, 1_025_000)).toBe(35);
  });

  it('после истечения не уходит в минус', () => {
    expect(resendSecondsLeft(1_000_000, 1_999_000)).toBe(0);
  });
});
