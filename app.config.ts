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

/**
 * Пины сертификата для iOS (§11) — те же ключи, что у Android.
 *
 * Источник истины один: plugins/withAndroidCertificatePinning.js, там же
 * разобрано, почему пиннится КОРЕНЬ цепочки Let's Encrypt, а не лист (лист
 * перевыпускается каждые 90 дней и превратил бы установленные приложения в
 * кирпич), и как отпечатки сняты с живой цепочки.
 *
 * Продублированы здесь, а не импортированы из плагина: плагин — CommonJS-файл
 * для config-plugins, и тянуть его require в типизированный конфиг ради двух
 * строк дороже, чем держать рядом. При ротации менять В ОБОИХ местах — об этом
 * же предупреждает комментарий в плагине.
 *
 * На iOS пиннинг задаётся через NSPinnedDomains в App Transport Security
 * (iOS 14+): система проверяет цепочку сама, до того как запрос дойдёт до
 * приложения. Отдельной библиотеки не нужно — и это важно, потому что
 * TrustKit и аналоги на New Architecture тянут за собой правку нативного кода.
 */
const CERTIFICATE_PINS = [
  // ISRG Root X2 — текущий якорь доверия цепочки.
  { 'SPKI-SHA256-BASE64': 'diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=' },
  // Root YE — резервный корень из той же цепочки. §11 требует два ключа:
  // без резерва ротация корня убьёт все установленные приложения.
  { 'SPKI-SHA256-BASE64': 'sCkq5UWXjg+7mKu9lMhhYF5bGLsy7VI/UNW3tccdR7w=' },
];

/** Домены API: основной и зеркало — как в network_security_config Android. */
const PINNED_DOMAINS = {
  'api.sorollm.tj': {
    NSIncludesSubdomains: false,
    NSPinnedCAIdentities: CERTIFICATE_PINS,
  },
  'api.sorollm.ai': {
    NSIncludesSubdomains: false,
    NSPinnedCAIdentities: CERTIFICATE_PINS,
  },
};

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
     * ЧАСТЬ ИСТОРИИ, которая объясняет блок ниже: открытый HTTP разрешён
     * ТОЛЬКО в дев-сборке, в релизе остаётся чистый ATS.
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
    /**
     * Манифест приватности (PrivacyInfo.xcprivacy). Обязателен с мая 2024:
     * App Store Connect отклоняет загрузку, если приложение обращается к
     * «API с обязательным обоснованием», а причина не заявлена.
     *
     * Проверено: ни react-native-mmkv, ни @op-engineering/op-sqlite, ни
     * expo-secure-store, ни expo-web-browser своего манифеста НЕ поставляют —
     * значит заявлять за них должно приложение, иначе это всплывёт письмом
     * ITMS-91053 после первой же загрузки.
     *
     * Заявлены ровно две категории, обе используются на самом деле:
     *   • UserDefaults (CA92.1) — RN и Expo хранят там свои настройки, доступ
     *     только к контейнеру собственного приложения;
     *   • FileTimestamp (C617.1) — база op-sqlite и expo-file-system читают
     *     время файлов внутри контейнера приложения.
     *
     * NSPrivacyTracking: false — §13 запрещает сторонние трекеры, рекламного
     * идентификатора приложение не касается вовсе.
     *
     * Состав собираемых данных (почта, имя, тексты диалогов) заявляется НЕ
     * здесь, а в анкете App Privacy в App Store Connect: манифест описывает
     * доступ к системным API, а не продуктовую политику.
     */
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
      ],
    },

    infoPlist: {
      /**
       * Экспортное заявление (Apple Export Compliance).
       *
       * false означает не «шифрования нет», а «используется только штатный
       * HTTPS системы» — это освобождённая категория. Без ключа App Store
       * Connect задаёт вопрос про экспорт при КАЖДОЙ загрузке в TestFlight и
       * держит сборку в обработке, пока на него не ответят руками.
       */
      ITSAppUsesNonExemptEncryption: false,

      /**
       * ATS: пиннинг сертификата (§11) — паритет с Android, где то же самое
       * делает plugins/withAndroidCertificatePinning.js.
       *
       * В дев-сборке к пиннингу добавляется послабление для локальной сети:
       * без него iPhone молча не достучится до сервера в домашней сети, и
       * ошибка придёт в приложение обычным сетевым сбоем.
       *
       * NSAllowsLocalNetworking, а не NSAllowsArbitraryLoads: послабление
       * действует только на приватные диапазоны (192.168.*, 10.*, *.local).
       * Выход в открытый интернет по HTTP закрыт даже в дев-сборке.
       */
      NSAppTransportSecurity: IS_DEV
        ? { NSAllowsLocalNetworking: true, NSPinnedDomains: PINNED_DOMAINS }
        : { NSPinnedDomains: PINNED_DOMAINS },

      ...(IS_DEV
        ? {
            /**
             * iOS 14+ спрашивает разрешение на обращение к устройствам
             * локальной сети. Без строки-обоснования система не может показать
             * запрос и глушит соединение молча — тот же симптом, что и выше.
             */
            NSLocalNetworkUsageDescription:
              'Барои пайваст шудан ба сервери озмоишӣ дар шабакаи маҳаллӣ.',
          }
        : {}),
    },
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
    /**
     * Нативный вход через Google (системное окно выбора аккаунта).
     *
     * Плагин добавляет в Android-сборку зависимости Play Services Auth, а в
     * iOS — обратную URL-схему клиента: через неё GIDSignIn возвращает
     * управление в приложение после экрана Google. Без схемы вход на iPhone
     * зависает на пустом экране.
     *
     * Схема — это идентификатор iOS-клиента задом наперёд, ровно как выдаёт
     * консоль. Секретом не является: она видна в Info.plist любой сборки.
     */
    [
      '@react-native-google-signin/google-signin',
      {
        iosUrlScheme:
          'com.googleusercontent.apps.500782884295-e1hntpkh21r8htmj6pes27p7mjm4igjh',
      },
    ],
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

    /**
     * Web-клиент мобильного проекта Google Cloud (500782884295), доступный
     * приложению в рантайме через expo-constants. Не секрет: идентификаторы
     * клиентов видны в любом OAuth-запросе. Здесь, а не константой в коде:
     * §6.1 не велит зашивать идентификаторы в экраны.
     *
     * Зачем web-клиент мобильному приложению: Google кладёт его в поле aud
     * выданного id_token, и по нему сервер убеждается, что токен выпущен для
     * нас. Библиотека называет это serverClientId.
     *
     * ПОЧЕМУ НЕ КЛИЕНТ САЙТА (480387520142-kvn3qpi2…). Android- и iOS-клиенты
     * заведены в проекте 500782884295, а Google требует, чтобы аудитория была
     * из ТОГО ЖЕ проекта: с чужим web-клиентом нативный вход отвечает отказом
     * ещё до показа окна. Клиент сайта продолжает работать в браузерном пути
     * (OAuth-редирект самого сервера) — там всё остаётся на его проекте.
     */
    googleWebClientId:
      '500782884295-iuvbrjg4u1nd004n3ecdj7acv9kq9e4t.apps.googleusercontent.com',

    /**
     * Клиент типа iOS из консоли (проект 500782884295). Нужен GIDSignIn,
     * чтобы опознать приложение по bundle id ai.zypl.soro; на Android не
     * используется вовсе — там опознание идёт по подписи APK.
     */
    googleIosClientId:
      '500782884295-e1hntpkh21r8htmj6pes27p7mjm4igjh.apps.googleusercontent.com',

    /**
     * Клиент типа Android. Нативному входу он не передаётся — там Google
     * опознаёт приложение по подписи APK, — но нужен браузерному: в адресе
     * возврата стоит его собственная схема (идентификатор задом наперёд).
     *
     * ВАЖНО: у Android-клиентов приём собственной схемы по умолчанию выключен.
     * Пока в консоли не включена галочка «Custom URI scheme», браузерный путь
     * на Android отвечает «Custom URI scheme is not enabled for your Android
     * client», и телефоны без сервисов Google войти не смогут.
     */
    googleAndroidClientId:
      '500782884295-nrvihf8vob0i4vqk6rarm3vodooa07b3.apps.googleusercontent.com',
  },
};

export default config;
