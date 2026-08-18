/**
 * Компонентные тесты (§14): «@testing-library/react-native для форм
 * авторизации и композера».
 *
 * ПОЧЕМУ ДВА РАННЕРА. Быстрый набор на node:test (222 теста) проверяет чистую
 * логику — парсер SSE, ошибки, группировку дат, очередь, LaTeX — и бежит за
 * четверть секунды, потому что не поднимает ни React, ни react-native.
 * Отправлять его в Jest ради компонентных тестов значило бы замедлить всё,
 * что и так работает. Поэтому Jest подключён ТОЛЬКО к __components__.
 *
 *   npm test            — быстрый набор (node:test)
 *   npm run test:ui     — компонентные (jest)
 *   npm run verify      — оба плюс линтеры и лицензии
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__components__/**/*.test.tsx'],
  setupFiles: ['<rootDir>/jest.setup.js'],

  /**
   * 20 секунд вместо стандартных пяти.
   *
   * Первый it() в файле оплачивает разовую загрузку модулей: react-native,
   * react-native-svg (иконка в чекбоксе), i18n со всеми тремя словарями.
   * Сам рендер занимает десятки миллисекунд — видно по остальным тестам
   * файла, — но первый упирался в потолок и падал по таймауту, хотя экран
   * исправен. Потолок поднят, а не тесты переписаны: медленный старт здесь
   * свойство окружения, а не продукта.
   */
  testTimeout: 20_000,

  /**
   * Модули из node_modules по умолчанию не трансформируются, а вся экосистема
   * React Native поставляется в нетранспилированном виде. Список — стандартный
   * для jest-expo плюс наши нативные зависимости.
   */
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-markdown-display|react-native-mathjax-svg|@shopify/flash-list|react-native-reanimated|react-native-gesture-handler|@op-engineering/op-sqlite|react-native-mmkv|lottie-react-native|@react-native-masked-view/.*))',
  ],
};
