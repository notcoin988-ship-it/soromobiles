#!/usr/bin/env node
/**
 * Проверка почтовых DNS-записей домена — задача B7.
 *
 * §17 требует подтверждённой доставки писем на Gmail, Mail.ru и Yandex —
 * «письма доходят и не попадают в спам», со скриншотами входящих. Одного
 * кода отправки для этого мало: без SPF, DKIM и DMARC письмо с кодом
 * подтверждения уйдёт в спам почти гарантированно, и человек не сможет
 * завершить регистрацию.
 *
 * Скрипт показывает текущее состояние и говорит, чего не хватает.
 *
 * Запуск:
 *   node scripts/check-mail-dns.mjs sorollm.tj
 *   node scripts/check-mail-dns.mjs sorollm.tj mail default s1   # свои селекторы DKIM
 */

import { Resolver } from 'node:dns/promises';

const domain = process.argv[2] ?? 'sorollm.tj';
const extraSelectors = process.argv.slice(3);

// DKIM нельзя перечислить: селектор известен только тому, кто настраивал
// отправку. Проверяем типовые плюс переданные аргументами.
const DKIM_SELECTORS = [
  ...extraSelectors,
  'default', 'mail', 'dkim', 'k1', 's1', 's2',
  'selector1', 'selector2', 'google', 'smtp',
  'mandrill', 'sendgrid', 'mailgun', 'postmark', 'zoho',
  // Селекторы транзакционных провайдеров — выбранный путь отправки (B7).
  // Amazon SES сюда не добавить: он генерирует селектор случайной строкой,
  // угадать её нельзя, её надо передать аргументом.
  'resend', 'brevo', 'sendinblue', 'mailjet', 'pm', 'mailo',
];

const resolver = new Resolver();
// Публичный резолвер: локальный DNS провайдера иногда отдаёт устаревшее.
resolver.setServers(['8.8.8.8', '1.1.1.1']);

const results = [];

function record(name, ok, detail, hint) {
  results.push({ name, ok, detail, hint });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok && hint) console.log(`       ${hint}`);
}

async function txt(host) {
  try {
    return (await resolver.resolveTxt(host)).map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

/**
 * Резолвится ли имя почтового сервера.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ПРОВЕРКА. Наличие MX-записи ничего не доказывает: она лишь
 * называет ИМЯ сервера, а доставка идёт по его адресу. Если у имени нет
 * A/AAAA-записи, отправляющий сервер не найдёт куда стучаться и вернёт письмо
 * отправителю — домен не принимает почту вообще, хотя MX на месте.
 *
 * Это не теоретический случай: ровно так и было у sorollm.tj — две MX-записи
 * на mail.sorollm.tj, у которого нет ни одной A-записи. Скрипт при этом
 * показывал зелёную галочку, и в docs/BACKEND-EMAIL.md попал вывод «почтовый
 * сервер свой, половина работы сделана». Половины не было.
 */
async function resolveHost(host) {
  for (const type of ['A', 'AAAA']) {
    try {
      const addresses = await resolver.resolve(host, type);
      if (addresses.length > 0) return addresses;
    } catch {
      // Пробуем следующий тип.
    }
  }
  return null;
}

async function checkMx() {
  let mx;
  try {
    mx = await resolver.resolveMx(domain);
  } catch {
    return record('MX', false, 'не удалось получить');
  }

  if (mx.length === 0) {
    return record('MX', false, 'записей нет', 'Домен не принимает почту — ответы пользователей никуда не придут.');
  }

  const hosts = mx.map((m) => `${m.exchange} (${m.priority})`).join(', ');

  // Каждый хост из MX обязан резолвиться — иначе запись указывает в пустоту.
  const unresolved = [];
  for (const exchange of new Set(mx.map((m) => m.exchange))) {
    if (!(await resolveHost(exchange))) unresolved.push(exchange);
  }

  if (unresolved.length > 0) {
    record(
      'MX',
      false,
      `${hosts} — но ${unresolved.join(', ')} НЕ резолвится`,
      'У хоста из MX нет A/AAAA-записи. Почта на домен не доставляется вообще:\n' +
        '       отправляющий сервер не находит адрес и возвращает письмо. Добавьте A-запись\n' +
        '       на IP почтового сервера — до этого ни DKIM, ни DMARC смысла не имеют.',
    );
    return;
  }

  record('MX', true, hosts);

  // Несколько записей с одним хостом бессмысленны: резервирования нет.
  const unique = new Set(mx.map((m) => m.exchange));
  if (unique.size < mx.length) {
    console.log('       ⚠ несколько MX ведут на один хост — резервирования это не даёт');
  }
}

async function checkSpf() {
  const records = await txt(domain);
  const spf = records.filter((r) => r.toLowerCase().startsWith('v=spf1'));

  if (spf.length === 0) {
    return record(
      'SPF',
      false,
      'записи нет',
      'Без SPF получатель не может проверить, что письмо отправлено с разрешённого сервера.',
    );
  }

  // Две SPF-записи — ошибка: по RFC получатель обязан считать проверку
  // неуспешной, и наличие «правильной» записи не спасает.
  if (spf.length > 1) {
    return record('SPF', false, `записей ${spf.length}, должна быть ровно одна`,
      'Несколько SPF-записей = permerror у получателя. Объедините в одну.');
  }

  const value = spf[0];
  record('SPF', true, value);

  if (value.includes('+all')) {
    console.log('       ⚠ +all разрешает отправку кому угодно — SPF теряет смысл');
  } else if (value.includes('~all')) {
    console.log('       ⚠ ~all (softfail) — на этапе отладки нормально, для прода надёжнее -all');
  }
}

async function checkDkim() {
  const found = [];
  for (const selector of DKIM_SELECTORS) {
    const records = await txt(`${selector}._domainkey.${domain}`);
    if (records.some((r) => r.toLowerCase().includes('v=dkim1'))) found.push(selector);
  }

  if (found.length === 0) {
    return record(
      'DKIM',
      false,
      'ни один типовой селектор не найден',
      'DKIM подписывает письмо криптографически. Без него Gmail и Mail.ru резко понижают доверие.\n' +
      '       Если селектор нестандартный, передайте его аргументом: node scripts/check-mail-dns.mjs ' + domain + ' <селектор>',
    );
  }

  record('DKIM', true, `селекторы: ${found.join(', ')}`);
}

async function checkDmarc() {
  const records = await txt(`_dmarc.${domain}`);
  const dmarc = records.filter((r) => r.toLowerCase().startsWith('v=dmarc1'));

  if (dmarc.length === 0) {
    return record(
      'DMARC',
      false,
      'записи нет',
      'DMARC говорит получателю, что делать при неудачной проверке SPF/DKIM,\n' +
      '       и присылает отчёты о том, кто шлёт письма от вашего имени.',
    );
  }

  const value = dmarc[0];
  record('DMARC', true, value);

  if (value.includes('p=none')) {
    console.log('       ⚠ p=none только собирает отчёты и ничего не блокирует —');
    console.log('         нормально для первых недель, дальше p=quarantine');
  }
  if (!value.includes('rua=')) {
    console.log('       ⚠ без rua= отчёты никуда не приходят, и вы не узнаете о проблемах');
  }
}

async function main() {
  console.log(`Почтовые DNS-записи домена: ${domain}`);
  console.log('─'.repeat(60));

  await checkMx();
  await checkSpf();
  await checkDkim();
  await checkDmarc();

  const failed = results.filter((r) => !r.ok);

  console.log('─'.repeat(60));
  if (failed.length === 0) {
    console.log('\n✅ Все записи на месте.');
    console.log('   Остался практический шаг: отправить тестовые письма на Gmail,');
    console.log('   Mail.ru и Yandex и убедиться, что они во «Входящих», а не в «Спаме» (§17).');
    process.exitCode = 0;
    return;
  }

  console.log(`\n❌ Не настроено: ${failed.map((f) => f.name).join(', ')}`);
  console.log('\nПока это не закрыто, письма с кодом подтверждения будут уходить в спам,');
  console.log('и пользователь не сможет завершить регистрацию (задачи B2, B4, критерий §17).');
  console.log('\nЧто именно добавить — в docs/BACKEND-EMAIL.md');
  process.exitCode = 1;
}

main();
