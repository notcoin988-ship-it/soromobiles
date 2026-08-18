#!/usr/bin/env node
/**
 * Проверка релизного бандла на секреты — критерий приёмки §17:
 * «В релизном бинарнике нет секретов и системных промптов (подтверждено
 * отчётом по strings / apktool)».
 *
 * Здесь это не пункт чек-листа, а команда, которую можно поставить в CI.
 *
 * Запуск:
 *   npm run build:android && npm run check:secrets
 *
 * Скрипт САМ не содержит ни одного секрета. Значения, которые нельзя
 * выпускать, читаются из .env-файлов на машине разработчика (они в .gitignore)
 * и сверяются с бандлом. Так проверка работает и не превращается в новую
 * точку утечки.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const BUNDLE_DIR = process.argv[2] ?? '.expo-export';

/**
 * Запрещённые в бандле подстроки, не зависящие от окружения.
 */
const FORBIDDEN_LITERALS = [
  {
    value: 'soro.zehnlab.ai',
    why: '§2.1: приложение НЕ должно обращаться к серверу инференса vLLM напрямую — только через продуктовый бэкенд',
  },
  {
    value: '/v1/chat/completions',
    why: '§2.1: ручка движка vLLM, мобильному клиенту она недоступна',
  },
  {
    /**
     * Гостевой вход удалён из проекта полностью — ни кода, ни кнопки, ни
     * дев-режима. Этот сторож не даёт ему вернуться незаметно: §8.2 запрещает
     * гостевой режим, а на бэкенде POST /auth/guest живой и работает, поэтому
     * соблазн «временно подключить для теста» будет возникать снова.
     *
     * Проверка ловит и dev-, и production-сборку.
     */
    value: '/auth/guest',
    why: '§8.2: гостевого режима в приложении нет и не должно появиться',
  },
  {
    value: 'DEV: живая Soro',
    why: '§8.2: маркер удалённого дев-режима гостевого входа',
  },
];

/**
 * Шаблоны, похожие на секреты. Ищем осторожно: цель — поймать реальный ключ,
 * а не завалить сборку на каждом длинном хэше сборщика.
 */
const SUSPICIOUS_PATTERNS = [
  { re: /\bsk-[A-Za-z0-9]{20,}\b/g, why: 'похоже на API-ключ формата sk-…' },
  { re: /\b\d{9,10}:AA[A-Za-z0-9_-]{30,}\b/g, why: 'похоже на токен Telegram-бота' },
  { re: /(SORO_API_KEY|API_KEY|SECRET_KEY|PRIVATE_KEY)\s*[:=]\s*["'][^"']{12,}["']/g, why: 'присвоение ключа строковым литералом' },
  { re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/g, why: 'приватный ключ' },
];

/** Файлы .env на машине — источник значений, которые точно нельзя выпускать. */
const ENV_CANDIDATES = [
  '.env',
  '.env.local',
  '../Soro_business/soro-business/.env',
  '../../Soro_business/soro-business/.env',
];

function collectLocalSecrets() {
  const secrets = [];
  for (const path of ENV_CANDIDATES) {
    if (!existsSync(path)) continue;
    // Разделитель именно /\r?\n/: в JS точка НЕ матчит \r (это терминатор
    // строки), поэтому на CRLF-файле `(.+)$` не срабатывает вообще, и парсер
    // молча возвращает ноль секретов. Проверка при этом «проходит» — то есть
    // врёт. Ровно на этом скрипт и попался при первом прогоне.
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      const value = rawValue.trim().replace(/^["']|["']$/g, '');
      // Отсеиваем плейсхолдеры и заведомо публичные значения.
      if (value.length < 16) continue;
      if (/^(ЗАПРОСИТЬ|ЗАПОЛНИТЬ|http|postgresql|redis)/i.test(value)) continue;
      if (!/(KEY|TOKEN|SECRET|PASSWORD)/.test(key)) continue;
      secrets.push({ key, value, source: path });
    }
  }
  return secrets;
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function main() {
  if (!existsSync(BUNDLE_DIR)) {
    console.error(`Бандл не найден: ${BUNDLE_DIR}`);
    console.error('Сначала соберите: npm run build:android');
    process.exit(2);
  }

  const scannable = walk(BUNDLE_DIR).filter((f) =>
    ['.js', '.hbc', '.json', '.map', '.html', ''].includes(extname(f)),
  );

  const localSecrets = collectLocalSecrets();
  const findings = [];

  console.log(`Проверяю ${scannable.length} файл(ов) в ${BUNDLE_DIR}`);
  console.log(`Значений из локальных .env для сверки: ${localSecrets.length}`);

  for (const file of scannable) {
    // .hbc — байткод Hermes, но строковые литералы в нём лежат открыто,
    // поэтому читаем как latin1 и ищем подстроки.
    const content = readFileSync(file, 'latin1');

    for (const secret of localSecrets) {
      if (content.includes(secret.value)) {
        findings.push({
          file,
          what: `значение ${secret.key} из ${secret.source}`,
          why: '§11: ни одного API-ключа в бинарнике',
        });
      }
    }

    for (const { value, why } of FORBIDDEN_LITERALS) {
      if (content.includes(value)) findings.push({ file, what: value, why });
    }

    for (const { re, why } of SUSPICIOUS_PATTERNS) {
      const matches = content.match(re);
      if (matches) {
        for (const m of new Set(matches)) {
          findings.push({ file, what: `${m.slice(0, 24)}…`, why });
        }
      }
    }
  }

  if (findings.length === 0) {
    console.log('\n✅ Секретов не найдено. Критерий §17 выполнен.');
    process.exit(0);
  }

  console.error(`\n❌ Найдено ${findings.length} проблем(ы):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}`);
    console.error(`    что: ${f.what}`);
    console.error(`    почему нельзя: ${f.why}\n`);
  }
  process.exit(1);
}

main();
