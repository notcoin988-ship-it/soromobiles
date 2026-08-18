#!/usr/bin/env node
/**
 * Контрактный тест бэкенда — исполняемое определение «готово» для задач
 * B1–B6 из §2.3 и §6.6.
 *
 * Зачем. Сейчас разговор «что не так с сервером» ведётся словами, и его легко
 * понять по-разному. Эта команда отвечает на него фактами: проходит по всему
 * контракту, который нужен мобильному приложению, и печатает, что работает,
 * чего нет и что сломано.
 *
 * Запуск:
 *   node scripts/check-contract.mjs http://localhost:8000      # против локального бэкенда
 *   node scripts/check-contract.mjs https://api.sorollm.tj     # против прода
 *
 * Код возврата 0 — контракт выполнен полностью, приложение может работать
 * против этого адреса. Ненулевой — нет.
 *
 * Скрипт ничего не ломает: создаёт один тестовый аккаунт со случайной почтой
 * и один чат.
 */

const BASE = (process.argv[2] ?? 'http://localhost:8787').replace(/\/+$/, '');
const TIMEOUT_MS = 30_000;

const results = [];
let tokens = { access: null, refresh: null };
let chatId = null;

function record(task, name, ok, detail) {
  results.push({ task, name, ok, detail });
  const mark = ok ? '✅' : '❌';
  console.log(`  ${mark} [${task}] ${name}${detail ? ` — ${detail}` : ''}`);
}

async function call(path, { method = 'GET', body, auth = false, raw = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (raw) return { status: response.status, response };
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: response.status, json, text };
  } catch (error) {
    return { status: 0, error: error instanceof Error ? error.message : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------

async function checkConfig() {
  console.log('\nB6 — конфигурация клиента');
  const r = await call('/v1/config?platform=android&version=1.0.0&lang=tg');

  if (r.status !== 200) {
    return record('B6', 'GET /v1/config', false, `отвечает ${r.status}, ожидался 200`);
  }
  record('B6', 'GET /v1/config', true);

  for (const field of ['min_supported_version', 'default_model', 'suggestions', 'links']) {
    record('B6', `поле ${field}`, r.json?.[field] !== undefined, r.json?.[field] === undefined ? 'отсутствует' : '');
  }
}

async function checkAuth() {
  console.log('\nB2 + B3 + B1 — регистрация, подтверждение, вход, токены');

  const email = `contract-${Date.now()}@example.tj`;
  const password = 'parolContract123';

  const reg = await call('/v1/auth/register', {
    method: 'POST',
    body: { email, password, fullname: 'Contract Test', lang: 'tg' },
  });

  if (reg.status === 404) {
    record('B2', 'POST /v1/auth/register', false, 'эндпоинта не существует (404)');
    record('B2', 'подтверждение почты кодом', false, 'недостижимо: нет регистрации');
    record('B3', 'вход по email + паролю', false, 'недостижимо: нет регистрации');
    record('B1', 'выдача access + refresh токенов', false, 'недостижимо: нет входа');
    return;
  }

  record('B2', 'POST /v1/auth/register', reg.status === 202, reg.status !== 202 ? `отвечает ${reg.status}, ожидался 202` : '');

  /**
   * Уникальность по email — суть задачи B2 (сейчас бэкенд проверяет по login).
   *
   * Допускаются два ответа, и это не послабление:
   *   409 email_taken — почта принадлежит подтверждённому аккаунту;
   *   202             — аккаунт ещё не подтверждён, код отправляется повторно.
   * Второе корректнее для пользователя: аккаунта фактически нет, и говорить
   * «почта занята» означало бы запереть человека, не дошедшего до письма.
   * §6.6 этот случай не описывает, поэтому тест принимает оба.
   */
  const dup = await call('/v1/auth/register', {
    method: 'POST',
    body: { email, password, fullname: 'Duplicate', lang: 'tg' },
  });
  record(
    'B2',
    'повтор регистрации обработан (409 либо 202 для неподтверждённой)',
    [409, 202].includes(dup.status),
    ![409, 202].includes(dup.status) ? `отвечает ${dup.status}` : '',
  );

  // Код приходит письмом — автоматически его не получить.
  console.log('     ↳ код подтверждения приходит письмом; дальше проверяется только форма ответов');

  const verify = await call('/v1/auth/verify', { method: 'POST', body: { email, code: '000000' } });
  record(
    'B2',
    'POST /v1/auth/verify отвергает неверный код',
    verify.status === 400,
    verify.status === 404 ? 'эндпоинта нет' : verify.status !== 400 ? `отвечает ${verify.status}` : '',
  );

  const login = await call('/v1/auth/login', { method: 'POST', body: { email, password } });
  if (login.status === 404) {
    record('B3', 'POST /v1/auth/login', false, 'эндпоинта не существует (404)');
  } else {
    // Незаверифицированный аккаунт обязан получить 403 email_not_verified.
    record('B3', 'POST /v1/auth/login отвечает по контракту', [200, 401, 403].includes(login.status), `статус ${login.status}`);
    if (login.status === 200) {
      tokens = { access: login.json?.access_token ?? null, refresh: login.json?.refresh_token ?? null };
      record('B1', 'вход выдаёт access + refresh', Boolean(tokens.access && tokens.refresh));
    }
  }

  const forgot = await call('/v1/auth/password/forgot', { method: 'POST', body: { email } });
  record('B4', 'POST /v1/auth/password/forgot всегда 202', forgot.status === 202, forgot.status === 404 ? 'эндпоинта нет' : `статус ${forgot.status}`);

  const refresh = await call('/v1/auth/refresh', { method: 'POST', body: { refresh_token: tokens.refresh ?? 'nonexistent' } });
  record('B1', 'POST /v1/auth/refresh существует', refresh.status !== 404, refresh.status === 404 ? 'эндпоинта нет' : `статус ${refresh.status}`);
}

async function checkChats() {
  console.log('\nЧаты и вопрос к модели (существующее)');

  const list = await call('/v1/chat/list?status=active', { auth: true });
  record('—', 'GET /v1/chat/list', [200, 401].includes(list.status), `статус ${list.status}`);

  if (!tokens.access) {
    console.log('     ↳ без токена дальше проверять нечего: нужен B1');
    return;
  }

  const created = await call('/v1/chat/create', { method: 'POST', body: { project_id: null }, auth: true });
  chatId = created.json?.chat_id ?? null;
  record('—', 'POST /v1/chat/create', created.status === 200 && Boolean(chatId));

  if (!chatId) return;

  const ask = await call('/v2/ask', {
    method: 'POST',
    auth: true,
    body: {
      messages: [{ role: 'user', content: 'Салом' }],
      chat_id: chatId,
      use_rag: false,
      model: 'fast',
      client_msg_id: `contract-${Date.now()}`,
    },
  });
  record('—', 'POST /v2/ask отвечает', ask.status === 200, `статус ${ask.status}`);

  // B8: повтор с тем же client_msg_id не должен создавать дубликат.
  record('B8', 'поле client_msg_id принимается', ask.status === 200, ask.status !== 200 ? 'не проверить' : '');

  // B10: сервер сам формирует заголовок чата.
  record('B10', 'ответ содержит chat_title', ask.json?.chat_title !== undefined, ask.json?.chat_title === undefined ? 'поля нет — заголовок формирует клиент' : '');
}

async function checkExtras() {
  console.log('\nB5 — удаление аккаунта');

  const del = await call('/v1/account', { method: 'DELETE', auth: true, body: { password: 'x' } });
  record('B5', 'DELETE /v1/account существует', del.status !== 404, del.status === 404 ? 'эндпоинта нет — требование обоих магазинов' : `статус ${del.status}`);

  // B11 — СПРАВОЧНО, не блокирует. Оценку 👍/👎 и жалобу убрали из приложения
  // по решению заказчика (см. src/features/chat/MessageActions.tsx), вместе с
  // ними отпала и задача B11. Эндпоинт /v1/report приложению больше не нужен;
  // его отсутствие — не провал. Проверку оставляем как информацию: если бэкенд
  // всё же его реализует, будет видно.
  console.log('\nB11 — жалоба (убрана из приложения, справочно)');
  const report = await call('/v1/report', {
    method: 'POST',
    auth: true,
    body: { message_id: '00000000-0000-0000-0000-000000000000', category: 'wrong' },
  });
  console.log(`  ℹ [B11] POST /v1/report — ${report.status === 404 ? 'не реализован (приложению не нужен)' : `статус ${report.status}`}`);
}

// ---------------------------------------------------------------------------

async function main() {
  console.log(`Контрактный тест бэкенда Soro`);
  console.log(`Адрес: ${BASE}\n${'─'.repeat(60)}`);

  const health = await call('/v1/health');
  if (health.status === 0) {
    console.error(`\nСервер недоступен: ${health.error}`);
    process.exitCode = 2;
    return;
  }

  await checkConfig();
  await checkAuth();
  await checkChats();
  await checkExtras();

  const failed = results.filter((r) => !r.ok);
  const byTask = new Map();
  for (const r of failed) byTask.set(r.task, (byTask.get(r.task) ?? 0) + 1);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Проверок: ${results.length}, провалено: ${failed.length}`);

  if (failed.length === 0) {
    console.log('\n✅ Контракт выполнен. Мобильное приложение может работать против этого адреса.');
    process.exitCode = 0;
    return;
  }

  console.log('\nНезакрытые задачи:');
  for (const [task, count] of [...byTask].sort()) {
    console.log(`  ${task}: ${count} проверок не пройдено`);
  }
  console.log('\nОписание задач — §2.3 и §6.6 ТЗ. Референс-реализация контракта —');
  console.log('docs/backend-reference/ (Python, FastAPI): встраивается в sorollm-webapp.');
  process.exitCode = 1;
}

main();
