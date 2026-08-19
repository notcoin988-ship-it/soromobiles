import { describe, it } from 'node:test';

import { expect } from '../../../test/expect';
import { GOOGLE_REDIRECT_URL, googleAuthUrl, parseGoogleRedirect } from '../googleAuthLink';

/**
 * Разбор возврата из браузера после Google (§6.6).
 *
 * Проверяется здесь, а не на устройстве, по простой причине: единственный
 * способ увидеть эти случаи вживую — довести реального человека до реального
 * Google и там что-нибудь сломать. Ошибка же в разборе выглядит как «вход не
 * работает» без единой подсказки, что именно пришло от сервера.
 */

describe('адрес входа через Google', () => {
  it('на конце baseUrl не удваивается слэш', () => {
    expect(googleAuthUrl('https://api.sorollm.tj/')).toBe(
      'https://api.sorollm.tj/auth/google?platform=mobile',
    );
    expect(googleAuthUrl('https://api.sorollm.tj')).toBe(
      'https://api.sorollm.tj/auth/google?platform=mobile',
    );
  });

  it('platform=mobile передаётся всегда: по нему сервер отличает нас от веба', () => {
    expect(googleAuthUrl('http://localhost:8787').includes('platform=mobile')).toBe(true);
  });
});

describe('разбор редиректа', () => {
  it('код достаётся из адреса возврата', () => {
    const result = parseGoogleRedirect(`${GOOGLE_REDIRECT_URL}?code=abc123`);
    expect(result.ok).toBe(true);
    expect(result.ok ? result.code : null).toBe('abc123');
  });

  it('код разэкранируется: сервер шлёт его в URL-кодировке', () => {
    const result = parseGoogleRedirect(`${GOOGLE_REDIRECT_URL}?code=a%2Fb%2Bc`);
    expect(result.ok ? result.code : null).toBe('a/b+c');
  });

  it('порядок параметров не важен', () => {
    const result = parseGoogleRedirect(`${GOOGLE_REDIRECT_URL}?state=xyz&code=abc123`);
    expect(result.ok ? result.code : null).toBe('abc123');
  });

  it('параметр с похожим именем за код не принимается', () => {
    // ?scope=… содержит подстроку code — наивный поиск взял бы его значение.
    const result = parseGoogleRedirect(`${GOOGLE_REDIRECT_URL}?scope=openid&encoded=zzz`);
    expect(result.ok).toBe(false);
  });

  it('отказ на стороне Google отличается от мусора', () => {
    const denied = parseGoogleRedirect(`${GOOGLE_REDIRECT_URL}?error=access_denied`);
    expect(denied.ok ? null : denied.reason).toBe('denied');

    const empty = parseGoogleRedirect(GOOGLE_REDIRECT_URL);
    expect(empty.ok ? null : empty.reason).toBe('malformed');
  });

  it('пустой code — это не успех', () => {
    // Иначе обмен уходит на сервер с пустой строкой и падает 422 вместо
    // понятной ошибки входа.
    const result = parseGoogleRedirect(`${GOOGLE_REDIRECT_URL}?code=`);
    expect(result.ok).toBe(false);
  });

  it('хвост #fragment в код не попадает', () => {
    const result = parseGoogleRedirect(`${GOOGLE_REDIRECT_URL}?code=abc#state`);
    expect(result.ok ? result.code : null).toBe('abc');
  });
});
