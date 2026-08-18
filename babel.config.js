/**
 * §5.3: никаких console.* в релизной сборке — вырезаются на этапе сборки,
 * чтобы тексты диалогов и токены не утекали в системный лог устройства
 * (§11, §13).
 *
 * Плагины подключаются только если реально установлены: на этапе 1 ещё нет ни
 * react-native-reanimated, ни babel-plugin-transform-remove-console, и жёсткая
 * ссылка на них уронила бы Metro при первом же запуске.
 */
function has(moduleName) {
  try {
    require.resolve(moduleName);
    return true;
  } catch {
    return false;
  }
}

module.exports = function babelConfig(api) {
  api.cache(true);

  const plugins = [];

  if (process.env.NODE_ENV === 'production' && has('babel-plugin-transform-remove-console')) {
    plugins.push(['transform-remove-console', { exclude: ['error', 'warn'] }]);
  }

  /**
   * Плагин воркетов обязан идти ПОСЛЕДНИМ — без него не работают ни анимации
   * Reanimated, ни свайпы по строкам чата в drawer (§8.4).
   *
   * В Reanimated 4 плагин переехал в react-native-worklets, а
   * react-native-reanimated/plugin остался тонкой обёрткой над ним. Берём
   * первоисточник, обёртку — запасным вариантом на случай отката до версии 3.
   */
  if (has('react-native-worklets/plugin')) {
    plugins.push('react-native-worklets/plugin');
  } else if (has('react-native-reanimated/plugin')) {
    plugins.push('react-native-reanimated/plugin');
  }

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
