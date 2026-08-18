import type { ExpoConfig } from 'expo/config';

/**
 * Конфигурация Expo.
 *
 * Базовый URL API НЕ задаётся здесь: Expo инлайнит переменные с префиксом
 * EXPO_PUBLIC_ прямо в бандл, поэтому код читает process.env.EXPO_PUBLIC_API_URL
 * напрямую (§6.1 — «не хардкодится в коде экранов»). Значение берётся из .env.
 *
 * Минимальные версии платформ. ОТКЛОНЕНИЕ ОТ §4.1, проверено на практике:
 *
 *   Бриф просил iOS 14.0, ТЗ §4.1 подняло до 15.1 («RN 0.76+ требует 15.1»),
 *   но Expo SDK 57 (RN 0.86) отвергает конфиг с deploymentTarget ниже 16.4:
 *   «ios.deploymentTarget needs to be at least version 16.4».
 *
 *   Практического ущерба тестовой матрице §12 нет: iPhone 8 и iPhone SE 2
 *   обновляются до iOS 16.7, то есть нижняя граница устройств сохраняется.
 *   Отсекаются iPhone 7 и старше. Требует отметки в §4.1 и в метаданных
 *   магазина.
 *
 * Android остаётся на API 24 (Android 7.0) по §4.1.
 * Задаются через expo-build-properties: в самом ExpoConfig полей
 * minSdkVersion/deploymentTarget нет.
 */

/**
 * Дев-сборка определяется по EXPO_PUBLIC_API_URL: против мока адрес локальный
 * и по HTTP, в проде — только https://api.sorollm.tj.
 */
const IS_DEV = !(process.env.EXPO_PUBLIC_API_URL ?? '').startsWith('https://');

const config: ExpoConfig = {
  name: 'Soro',
  /**
   * Идентификатор проекта на EAS, а не имя приложения. Должен совпадать со
   * slug проекта на expo.dev, иначе `eas build` откажется связывать сборку
   * («Slug ... does not match»). На то, что видит пользователь, не влияет:
   * имя приложения — `name` выше, идентификаторы пакетов — ниже.
   */
  slug: 'zehnai',
  /**
   * Аккаунт-владелец на EAS. Проект принадлежит организации, а не личному
   * аккаунту, поэтому владелец указан явно: иначе сборку, запущенную другим
   * участником команды, EAS попытается положить в его личный аккаунт.
   */
  owner: 'notcoins-team',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  scheme: 'soro', // deep links soro:// (§5.1, §11)
  userInterfaceStyle: 'automatic',
  backgroundColor: '#0B090A', // bg0 тёмной темы — она по умолчанию (§7)
  // New Architecture в SDK 57 включена по умолчанию — отдельного флага
  // newArchEnabled в ExpoConfig больше нет (§4.2 требует её включённой).
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'ai.zypl.soro',
    // То же назначение, что и versionCode на Android (§13).
    buildNumber: '1',

    /**
     * Зеркало android.usesCleartextTraffic (§11): открытый HTTP разрешён
     * ТОЛЬКО в дев-сборке против мока, в релизе остаётся чистый ATS.
     *
     * Без этого блока iPhone молча не достучится до мок-сервера. App
     * Transport Security режет любой http:// на уровне системы, причём
     * ошибка приходит в приложение обычным сетевым сбоем — на экране будет
     * «Сервер дастрас нест», и искать причину придётся в приложении, где её
     * нет. На Android этой засады не было: там сборка ходила через
     * `adb reverse` на localhost, а localhost из ATS исключён по умолчанию.
     *
     * NSAllowsLocalNetworking, а не NSAllowsArbitraryLoads: послабление
     * распространяется только на приватные диапазоны (192.168.*, 10.*,
     * *.local) — ровно на мок в домашней сети. Выход в открытый интернет по
     * HTTP остаётся закрытым даже в дев-сборке.
     */
    infoPlist: IS_DEV
      ? {
          NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
          /**
           * iOS 14+ спрашивает разрешение на обращение к устройствам
           * локальной сети. Без строки-обоснования система не может показать
           * запрос и глушит соединение молча — тот же симптом, что и выше.
           */
          NSLocalNetworkUsageDescription:
            'Барои пайваст шудан ба сервери озмоишӣ дар шабакаи маҳаллӣ.',
        }
      : undefined,
  },
  android: {
    package: 'ai.zypl.soro',
    /**
     * Номер сборки. §13 требует показывать его на экране «Дар бораи барнома»,
     * чтобы человек мог назвать его в поддержке — а Google Play вдобавок не
     * примет два загруженных файла с одинаковым versionCode.
     *
     * Увеличивается ВРУЧНУЮ на каждую загрузку в магазин.
     */
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: '#0B090A',
      foregroundImage: './assets/android-icon-foreground.png',
      /**
       * Монохромный слой для темы Material You (Android 13+). Файл давно
       * генерировался `npm run gen:icons`, но здесь объявлен не был — система
       * его не подхватывала, и в «монохромном» режиме рабочего стола иконка
       * оставалась цветной, выпадая из общей палитры.
       */
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    // Поле ввода прилипает к клавиатуре (§7.4).
    softwareKeyboardLayoutMode: 'resize',
    predictiveBackGestureEnabled: false,

    // --- Безопасность (§11) ---
    //
    // Открытый HTTP выключается через expo-build-properties (см. plugins ниже):
    // в самом ExpoConfig поля usesCleartextTraffic нет.
    //
    // Резервные копии выключены. Иначе Android выгружает данные приложения в
    // Google Drive: токены лежат в Keystore и туда не попадут, а локальная
    // база с историей диалогов — попадёт, и утечёт вместе с аккаунтом Google.
    allowBackup: false,

    // Приложению не нужно НИ ОДНО опасное разрешение: нет камеры, микрофона,
    // геолокации, контактов. Пустой список — это и заявление в Play Console,
    // и защита от того, что транзитивная зависимость притащит своё.
    permissions: [],
    blockedPermissions: [
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.READ_CONTACTS',
      'android.permission.READ_EXTERNAL_STORAGE',
    ],
  },
  plugins: [
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.4' },
        android: {
          // Только minSdk из §4.1 (Android 7.0). compileSdk и targetSdk НЕ
          // фиксируем: Expo SDK 57 подставляет свои, а жёсткое 35 роняло сборку —
          // зависимости требуют более новый compileSdk.
          minSdkVersion: 24,
          // TLS обязателен (§11). Открытый HTTP разрешён ТОЛЬКО в дев-сборке,
          // где клиент ходит на http://localhost к мок-серверу. В релизе
          // система сама заблокирует любой незашифрованный запрос.
          usesCleartextTraffic: IS_DEV,

          /**
           * R8 + ProGuard (§11 «Обфускация: Android R8 + ProGuard-правила»).
           *
           * Шаблон Expo оставляет `android.enableMinifyInReleaseBuilds`
           * пустым, а `app/build.gradle` читает его с умолчанием false — то
           * есть релиз собирался БЕЗ минификации и обфускации вообще. Ловится
           * это только сборкой: `minifyEnabled enableMinifyInReleaseBuilds` в
           * build.gradle выглядит включённым.
           *
           * Правила — в android/app/proguard-rules.pro. Их наличие
           * обязательно: R8 вырезает то, к чему обращаются рефлексией, а на
           * этом стоит половина нативных модулей React Native.
           */
          enableMinifyInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
    [
      'expo-font',
      {
        /**
         * Шрифты встраиваются в бандл нативно, а не подгружаются с Google
         * Fonts (§7.2, офлайн-требование §10).
         *
         * ИМЕНА ФАЙЛОВ КРИТИЧНЫ. Документация Expo v57: «On Android, the file
         * name becomes the font family name». Поэтому файлы названы ровно так,
         * как их ждёт маппинг в design/tokens.ts. Переименование файла молча
         * сломает всю типографику.
         *
         * На iOS имя семейства берётся из самого файла и может отличаться —
         * при выходе на iOS проверить через Font.getLoadedFonts().
         */
        fonts: [
          './assets/fonts/Inter-Light.ttf',
          './assets/fonts/Inter-Regular.ttf',
          './assets/fonts/Inter-Medium.ttf',
          './assets/fonts/Inter-SemiBold.ttf',
          './assets/fonts/Inter-Bold.ttf',
          './assets/fonts/Inter-ExtraBold.ttf',
        ],
      },
    ],
    /**
     * Встроенный браузер для юридических документов (§8.1: ссылки
     * «открываются во встроенном браузере, а не выкидывают из приложения»).
     * На Android это Custom Tabs, на iOS — SafariViewController.
     */
    'expo-web-browser',
    // Certificate pinning (§11). Пиннится корень цепочки, а не лист: сертификат
    // Let's Encrypt перевыпускается каждые 90 дней, и пин на лист убил бы все
    // установленные приложения. Обоснование — в комментарии плагина.
    './plugins/withAndroidCertificatePinning',
  ],

  /**
   * Идентификатор проекта на EAS. Прописан руками: конфиг динамический (.ts),
   * и `eas init` в такой записать его не может — он лишь печатает значение и
   * просит перенести. Без этого поля `eas build` не знает, в какой проект
   * складывать сборки.
   */
  extra: {
    eas: {
      projectId: '68b192f4-0338-4c56-bb46-8ccc29e26f2d',
    },
  },
};

export default config;
