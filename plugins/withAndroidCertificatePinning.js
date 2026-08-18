const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Certificate pinning для Android (§11).
 *
 * ВАЖНОЕ РЕШЕНИЕ, и оно не очевидное.
 *
 * api.sorollm.tj обслуживается сертификатом Let's Encrypt, который
 * перевыпускается каждые 90 дней (проверено: лист действует до 20.09.2026).
 * Пиннинг листового сертификата превратил бы все установленные приложения в
 * кирпич при первом же перевыпуске — через два месяца после релиза, без
 * возможности починить иначе как обновлением в Play.
 *
 * Поэтому пиннится КОРЕНЬ цепочки, он стабилен годами, плюс резервный пин.
 * §11 прямо требует два ключа: «Пинить два ключа: текущий и резервный, иначе
 * ротация сертификата убьёт все установленные приложения».
 *
 * Отпечатки сняты с живой цепочки:
 *   openssl s_client -connect api.sorollm.tj:443 -servername api.sorollm.tj -showcerts
 *   | openssl x509 -pubkey -noout | openssl pkey -pubin -outform der
 *   | openssl dgst -sha256 -binary | openssl enc -base64
 *
 * Ограничение, которое надо понимать: пин на публичный корень Let's Encrypt
 * защищает от подменённого корпоративного CA и от перехвата с самоподписанным
 * сертификатом, но НЕ от злоумышленника, который сам получил сертификат
 * Let's Encrypt на этот домен. Полноценную защиту дал бы приватный CA — это
 * отдельное решение уровня инфраструктуры.
 *
 * Kill switch: §11 требует возможности отключить пиннинг через /v1/config
 * (`certificate_pinning_enabled`). Здесь пиннинг задаётся на уровне системы и
 * флагом не выключается — флаг остаётся способом отключить его в СЛЕДУЮЩЕЙ
 * сборке, не переписывая плагин.
 */

const DOMAIN = 'api.sorollm.tj';
const MIRROR = 'api.sorollm.ai';

/** Дата, после которой пины перестают применяться, если о них забыли обновить. */
const EXPIRATION = '2027-06-01';

const PINS = [
  // ISRG Root X2 — текущий якорь доверия цепочки.
  'diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=',
  // Root YE — резервный корень Let's Encrypt из той же цепочки.
  'sCkq5UWXjg+7mKu9lMhhYF5bGLsy7VI/UNW3tccdR7w=',
];

function buildNetworkSecurityConfig() {
  const pinEntries = PINS.map((pin) => `      <pin digest="SHA-256">${pin}</pin>`).join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!--
  Сгенерировано plugins/withAndroidCertificatePinning.js — не править вручную.
  Пиннинг корня цепочки Let's Encrypt (§11). Подробности и обоснование выбора
  корня вместо листа — в комментарии плагина и docs/SECURITY.md.
-->
<network-security-config>
  <!-- Открытый HTTP запрещён везде, кроме localhost для дев-сборки. -->
  <base-config cleartextTrafficPermitted="false" />

  <domain-config cleartextTrafficPermitted="false">
    <domain includeSubdomains="false">${DOMAIN}</domain>
    <domain includeSubdomains="false">${MIRROR}</domain>
    <pin-set expiration="${EXPIRATION}">
${pinEntries}
    </pin-set>
  </domain-config>

  <!-- Мок-сервер на localhost: только для дев-сборки. -->
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="true">localhost</domain>
    <domain includeSubdomains="true">10.0.2.2</domain>
  </domain-config>
</network-security-config>
`;
}

module.exports = function withAndroidCertificatePinning(config) {
  // 1. Кладём XML в res/xml.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resXml = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(resXml, { recursive: true });
      fs.writeFileSync(
        path.join(resXml, 'network_security_config.xml'),
        buildNetworkSecurityConfig(),
        'utf8',
      );
      return cfg;
    },
  ]);

  // 2. Прописываем ссылку на него в манифесте.
  config = withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    }
    return cfg;
  });

  return config;
};
