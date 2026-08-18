/* eslint-disable no-undef */

/**
 * Заглушки нативных модулей для компонентных тестов (§14).
 *
 * Jest выполняет код в Node, где нативной части нет вовсе. Каждая заглушка
 * ниже стоит не «чтобы прошло», а потому что соответствующий модуль на этом
 * уровне не проверяется: формы авторизации и композер тестируются как
 * поведение — что вводится, что показывается, что уходит наружу, — а хранение
 * ключей, шифрование базы и анимации проверяются иначе.
 */

// MMKV — нативное хранилище настроек. Подменяем на обычный Map.
jest.mock('react-native-mmkv', () => {
  const store = new Map();
  return {
    createMMKV: () => ({
      getString: (key) => store.get(key),
      set: (key, value) => store.set(key, value),
      // Именно remove: в MMKV 4 метод называется так, а не delete. Заглушка с
      // чужим именем молча расходилась бы с настоящим API.
      remove: (key) => store.delete(key),
      contains: (key) => store.has(key),
    }),
  };
});

// Keychain/Keystore: в тестах секретов нет, и хранить нечего.
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
}));

// Зашифрованная база: компонентные тесты до неё не доходят.
jest.mock('@op-engineering/op-sqlite', () => ({
  open: () => ({
    execute: async () => ({ rows: [], rowsAffected: 0 }),
    transaction: async (fn) => fn({ execute: async () => ({ rows: [], rowsAffected: 0 }) }),
    delete: () => {},
  }),
}));

// Состояние сети: по умолчанию считаем, что интернет есть.
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: () => () => {},
  fetch: async () => ({ isConnected: true, isInternetReachable: true }),
}));

// Lottie и Reanimated тянут нативные вьюхи; для проверки поведения форм
// достаточно пустых компонентов.
jest.mock('lottie-react-native', () => 'LottieView');

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  captureException: jest.fn(),
}));

/**
 * Локализация поднимается по-настоящему, а не заглушкой.
 *
 * Без неё t() возвращает ключ, и тест «пароль открывается кнопкой Нишон
 * додан» падал бы, хотя экран исправен. Заодно это проверяет, что ключи из
 * Приложения C на месте: опечатка в ключе теперь роняет тест, а не тихо
 * показывает пользователю «auth.showPassword».
 */
require('./src/i18n').initI18n('tg');

/**
 * Reanimated в Jest не поднимается: его инициализатор лезет в нативные
 * воркеты, которых в Node нет. Штатный мок библиотеки для версии 4 ещё не
 * годится, поэтому подменяем ровно то, чем пользуемся — анимация в
 * компонентных тестах не проверяется, важно лишь, что экран рисуется.
 */
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View, Image: View, ScrollView: View, createAnimatedComponent: (c) => c },
    useSharedValue: (initial) => ({ value: initial }),
    useAnimatedStyle: () => ({}),
    withTiming: (to) => to,
    withRepeat: (v) => v,
    Easing: { linear: (t) => t, inOut: () => (t) => t, sin: (t) => t },
  };
});
