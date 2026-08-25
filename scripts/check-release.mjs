#!/usr/bin/env node
/**
 * Проверка готовности релизной сборки — одна команда перед загрузкой в Play.
 *
 * Ловит ровно те поломки, которых не видно ни в логе сборки, ни в готовом
 * артефакте на глаз, и каждая из которых на этом проекте уже случалась:
 *
 *   1. Бандл собран без EXPO_PUBLIC_API_URL. Тогда src/api/index.ts молча
 *      откатывается на http://localhost:8787: приложение выглядит здоровым и
 *      ходит в никуда. Так уехала iOS-сборка soro-ios-1787236982.
 *   2. Та же переменная решает режим нативной части (app.config.ts): без неё
 *      в релиз попадают usesCleartextTraffic и послабления для локальной сети.
 *   3. Пины сертификата разошлись с живой цепочкой. Это не ломает сборку —
 *      это ломает УЖЕ УСТАНОВЛЕННЫЕ приложения в день, когда сервер сменит
 *      корень, и починить с сервера будет нечем.
 *
 * Запуск:
 *   npm run check:release                 — собрать бандл заново и проверить всё
 *   npm run check:release -- --no-export  — проверить уже собранный .expo-export
 */

import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { connect } from 'node:tls';

/** Прод-адрес. Он же признак релизного режима для app.config.ts. */
const API_URL = 'https://api.sorollm.tj';
const BUNDLE_DIR = '.expo-export';
const SKIP_EXPORT = process.argv.includes('--no-export');

/**
 * CLI Expo запускается своим js-файлом, а не через npx: с Node 24 запуск
 * npx.cmd из скрипта падает с EINVAL (Windows больше не позволяет spawn .cmd
 * без shell), а поднимать shell ради одного вызова — лишний слой кавычек.
 */
const EXPO_CLI = join('node_modules', 'expo', 'bin', 'cli');

const failures = [];
const notes = [];

const ok = (text) => console.log(`  ✅ ${text}`);
const warn = (text) => {
  console.log(`  ⚠️  ${text}`);
  notes.push(text);
};
const bad = (text, why) => {
  console.log(`  ❌ ${text}`);
  failures.push({ text, why });
};
const section = (title) => console.log(`\n${title}`);

/** Конфиг читается тем же способом, что и сборкой, — через сам Expo. */
function readConfig() {
  const raw = execFileSync(process.execPath, [EXPO_CLI, 'config', '--json', '--type', 'public'], {
    env: { ...process.env, EXPO_PUBLIC_API_URL: API_URL },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

function checkConfig(exp) {
  section('Конфигурация релиза');

  const version = exp.version ?? '';
  if (/^\d+\.\d+\.\d+$/.test(version)) ok(`version ${version}`);
  else bad(`version = «${version}» — не semver`, 'эту строку Play показывает пользователю');

  const versionCode = exp.android?.versionCode;
  if (Number.isInteger(versionCode) && versionCode >= 1) {
    ok(`versionCode ${versionCode}`);
    notes.push(
      `versionCode ${versionCode}: два файла с одинаковым номером Play не примет — поднимать вручную в app.config.ts`,
    );
  } else {
    bad(`versionCode = ${versionCode}`, 'без целого номера файл не загрузится');
  }

  if (exp.android?.package) ok(`package ${exp.android.package}`);
  else bad('android.package не задан', 'это идентификатор приложения в Play, менять его потом нельзя');

  const props = (exp.plugins ?? []).find((p) => Array.isArray(p) && p[0] === 'expo-build-properties');
  const android = props?.[1]?.android ?? {};

  if (android.usesCleartextTraffic === false) ok('открытый HTTP выключен');
  else bad('usesCleartextTraffic не false', 'сборка вышла в дев-режиме — проверьте EXPO_PUBLIC_API_URL');

  if (android.enableMinifyInReleaseBuilds === true) ok('R8 и обфускация включены');
  else bad('enableMinifyInReleaseBuilds не true', '§11 требует обфускацию в релизе');

  const ats = exp.ios?.infoPlist?.NSAppTransportSecurity ?? {};
  if (!ats.NSAllowsLocalNetworking && !ats.NSAllowsArbitraryLoads) ok('ATS без послаблений (iOS)');
  else bad('в ATS осталось послабление для локальной сети', 'признак дев-конфигурации в релизе');

  const permissions = exp.android?.permissions;
  if (Array.isArray(permissions) && permissions.length === 0) ok('опасных разрешений нет');
  else warn(`android.permissions = ${JSON.stringify(permissions)} — каждое придётся объяснять в Play Console`);
}

/** Пины и срок берутся из плагина — источник истины по §11 один. */
function readPins() {
  const plugin = readFileSync(join('plugins', 'withAndroidCertificatePinning.js'), 'utf8');
  const pins = [...plugin.matchAll(/'([A-Za-z0-9+/]{43}=)'/g)].map((m) => m[1]);
  const expiration = plugin.match(/EXPIRATION = '(\d{4}-\d{2}-\d{2})'/)?.[1];
  return { pins, expiration };
}

/**
 * SPKI-отпечаток каждого звена живой цепочки — ровно то, что сверяет Android.
 *
 * Ключ берётся через X509Certificate и экспортируется в SPKI: поле `pubkey`
 * из getPeerCertificate даёт ключ в другом представлении, и хэш от него не
 * совпадает ни с одним настоящим пином — проверка молча «не находит» верные.
 */
function livePins(host) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host, port: 443, servername: host, rejectUnauthorized: false }, () => {
      const chain = [];
      const seen = new Set();
      let cert = socket.getPeerCertificate(true);
      while (cert && cert.fingerprint256 && !seen.has(cert.fingerprint256)) {
        seen.add(cert.fingerprint256);
        if (cert.raw) {
          const spki = new X509Certificate(cert.raw).publicKey.export({ type: 'spki', format: 'der' });
          chain.push({
            subject: cert.subject?.CN ?? '(без CN)',
            pin: createHash('sha256').update(spki).digest('base64'),
          });
        }
        cert = cert.issuerCertificate;
      }
      socket.end();
      resolve(chain);
    });
    socket.setTimeout(15_000, () => {
      socket.destroy();
      reject(new Error('сервер не ответил за 15 секунд'));
    });
    socket.on('error', reject);
  });
}

async function checkPins() {
  section('Пиннинг сертификата против живого сервера');

  const { pins, expiration } = readPins();
  if (pins.length < 2) {
    bad(
      `в плагине ${pins.length} пин(ов)`,
      '§11 требует два: без резервного ротация корня превратит установленные приложения в кирпич',
    );
    return;
  }

  const host = new URL(API_URL).hostname;
  let chain;
  try {
    chain = await livePins(host);
  } catch (e) {
    warn(`цепочку ${host} получить не удалось (${e.message}) — пины не сверены`);
    return;
  }

  const live = new Set(chain.map((c) => c.pin));
  const matched = pins.filter((p) => live.has(p));
  if (matched.length > 0) {
    ok(`${matched.length} из ${pins.length} пинов найдены в цепочке ${host}`);
    for (const c of chain) {
      if (pins.includes(c.pin)) console.log(`     ↳ ${c.subject}`);
    }
  } else {
    bad(
      `ни один пин не совпал с цепочкой ${host}`,
      'релиз с такими пинами не откроет НИ ОДНОГО соединения с сервером',
    );
    console.log('     живая цепочка:');
    for (const c of chain) console.log(`       ${c.pin}  ${c.subject}`);
  }

  if (!expiration) return;
  const daysLeft = Math.round((Date.parse(expiration) - Date.now()) / 86_400_000);
  if (daysLeft < 0) bad(`срок пинов истёк ${expiration}`, 'после этой даты Android перестаёт их применять');
  else if (daysLeft < 180) warn(`срок пинов истекает через ${daysLeft} дн. (${expiration})`);
  else ok(`срок пинов ${expiration} (${daysLeft} дн.)`);
}

function exportBundle() {
  section('Сборка JS-бандла с прод-адресом');
  console.log(`  … expo export, EXPO_PUBLIC_API_URL=${API_URL}`);
  execFileSync(
    process.execPath,
    [EXPO_CLI, 'export', '--platform', 'android', '--output-dir', BUNDLE_DIR],
    { env: { ...process.env, EXPO_PUBLIC_API_URL: API_URL }, stdio: 'ignore' },
  );
  ok('бандл собран');
}

function bundleFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...bundleFiles(full));
    else out.push(full);
  }
  return out;
}

function checkBundle() {
  section('Адрес сервера внутри бандла');

  if (!existsSync(BUNDLE_DIR)) {
    bad(`${BUNDLE_DIR} не найден`, 'проверять нечего: запустите без --no-export');
    return;
  }

  const files = bundleFiles(BUNDLE_DIR).filter((f) => /\.(hbc|js|json)$/.test(f));
  let prod = 0;
  let dev = 0;
  for (const file of files) {
    const content = readFileSync(file, 'latin1');
    if (content.includes('api.sorollm.tj')) prod++;
    if (content.includes('localhost:8787')) dev++;
  }

  if (prod > 0) ok(`api.sorollm.tj найден (файлов: ${prod})`);
  else bad('api.sorollm.tj в бандле нет', 'приложение уйдёт не туда — пересоберите с EXPO_PUBLIC_API_URL');

  if (dev === 0) ok('localhost:8787 в бандле нет');
  else bad(`localhost:8787 найден (файлов: ${dev})`, 'в релизный бандл попал дев-адрес');
}

async function main() {
  console.log('Готовность релизной сборки Soro');
  console.log('─'.repeat(60));

  checkConfig(readConfig());
  if (!SKIP_EXPORT) exportBundle();
  checkBundle();
  await checkPins();

  console.log(`\n${'─'.repeat(60)}`);
  for (const note of notes) console.log(`  ⚠️  ${note}`);

  if (failures.length === 0) {
    console.log('\n✅ Артефакт можно загружать. Что проверить в самой Play Console — docs/RELEASE.md');
    process.exit(0);
  }

  console.error(`\n❌ Проблем: ${failures.length}\n`);
  for (const f of failures) console.error(`  ${f.text}\n    почему важно: ${f.why}\n`);
  process.exit(1);
}

main().catch((e) => {
  console.error(`\n❌ Проверка не доехала: ${e.message}`);
  process.exit(1);
});
