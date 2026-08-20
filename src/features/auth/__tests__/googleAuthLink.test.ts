import { describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import {
  googleAuthUrl,
  parseGoogleRedirect,
  redirectUriFor,
  reversedClientScheme,
  tokenRequestBody,
} from '../googleAuthLink';

/**
 * Браузерный вход через Google (для телефонов без сервисов Google).
 *
 * Проверяется здесь, а не на устройстве, по простой причине: единственный
 * способ увидеть эти случаи вживую — довести реального человека до реального
 * Google и там что-нибудь сломать. Ошибка же в склейке адреса или в разборе
 * ответа выглядит как «вход не работает», без единой подсказки почему.
 */

const CLIENT = '500782884295-nrvihf8vob0i4vqk6rarm3vodooa07b3.apps.googleusercontent.com';

describe('адрес возврата', () => {
  it('схема — идентификатор клиента задом наперёд, без хвоста googleusercontent', () => {
    expect(reversedClientScheme(CLIENT)).toBe(
      'com.googleusercontent.apps.500782884295-nrvihf8vob0i4vqk6rarm3vodooa07b3',
    );
  });

  it('адрес возврата совпадает с тем, что ждёт Google', () => {
    // Google сверяет redirect_uri побайтово: лишний слэш — и вход отвергнут.
    expect(redirectUriFor(CLIENT)).toBe(
      'com.googleusercontent.apps.500782884295-nrvihf8vob0i4vqk6rarm3vodooa07b3:/oauth2redirect',
    );
  });
});

describe('адрес согласия', () => {
  const url = googleAuthUrl({ clientId: CLIENT, challenge: 'CHAL+LENGE/=', state: 'st4te' });

  it('идёт на Google и несёт наш клиент', () => {
    expect(url.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
    expect(url.includes(`client_id=${encodeURIComponent(CLIENT)}`)).toBe(true);
  });

  it('PKCE обязателен: challenge и метод S256', () => {
    // Без code_challenge Google выдаст код, который сможет обменять кто угодно
    // перехвативший редирект, — секрета у приложения нет.
    expect(url.includes('code_challenge=CHAL%2BLENGE%2F%3D')).toBe(true);
    expect(url.includes('code_challenge_method=S256')).toBe(true);
  });

  it('запрашивается только openid email profile', () => {
    expect(url.includes(`scope=${encodeURIComponent('openid email profile')}`)).toBe(true);
  });

  it('спрашивается выбор аккаунта', () => {
    // Иначе человек с одним аккаунтом в браузере войдёт молча и не поймёт,
    // каким именно.
    expect(url.includes('prompt=select_account')).toBe(true);
  });
});

describe('разбор возврата', () => {
  const back = 'com.googleusercontent.apps.x:/oauth2redirect';

  it('код достаётся при совпадении state', () => {
    const result = parseGoogleRedirect(`${back}?state=st4te&code=abc123`, 'st4te');
    expect(result.ok).toBe(true);
    expect(result.ok ? result.code : null).toBe('abc123');
  });

  it('чужой state отвергается, даже если код на месте', () => {
    // На Android ту же схему может зарегистрировать другое приложение и
    // подсунуть свой ответ.
    const result = parseGoogleRedirect(`${back}?state=other&code=abc123`, 'st4te');
    expect(result.ok ? null : result.reason).toBe('state_mismatch');
  });

  it('отказ человека отличается от мусора', () => {
    const denied = parseGoogleRedirect(`${back}?error=access_denied&state=st4te`, 'st4te');
    expect(denied.ok ? null : denied.reason).toBe('denied');

    const empty = parseGoogleRedirect(`${back}?state=st4te`, 'st4te');
    expect(empty.ok ? null : empty.reason).toBe('malformed');
  });

  it('код разэкранируется и не путается с похожими именами', () => {
    const result = parseGoogleRedirect(`${back}?scope=openid&state=st4te&code=a%2Fb`, 'st4te');
    expect(result.ok ? result.code : null).toBe('a/b');
  });

  it('хвост #fragment в код не попадает', () => {
    const result = parseGoogleRedirect(`${back}?state=st4te&code=abc#x`, 'st4te');
    expect(result.ok ? result.code : null).toBe('abc');
  });
});

describe('обмен кода на токены', () => {
  const body = tokenRequestBody({ clientId: CLIENT, code: 'the code', verifier: 'ver+ifier' });

  it('форма содержит всё, что требует Google, и ничего лишнего', () => {
    expect(body.includes('grant_type=authorization_code')).toBe(true);
    expect(body.includes('code=the%20code')).toBe(true);
    expect(body.includes('code_verifier=ver%2Bifier')).toBe(true);
    expect(body.includes(`redirect_uri=${encodeURIComponent(redirectUriFor(CLIENT))}`)).toBe(true);
  });

  it('секрета клиента в теле нет', () => {
    // У установленного приложения секрета не бывает: он лежал бы в APK.
    // Вместо него PKCE-verifier выше.
    expect(body.includes('client_secret')).toBe(false);
  });
});
