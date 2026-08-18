const { getDefaultConfig } = require('expo/metro-config');

/**
 * Настройки бандлера.
 *
 * Единственное отличие от значений по умолчанию — Metro не следит за
 * артефактами нативной сборки. Причина не в скорости, а в падениях: Gradle
 * и CMake пересоздают каталоги под android/**\/build на каждой сборке, а
 * файловый наблюдатель Metro при исчезновении отслеживаемого каталога падает
 * с ENOENT на watch и уносит с собой весь дев-сервер. Ловилось ровно так:
 * смена версии react-native-worklets → чистка кэшей CMake → Metro умер.
 *
 * В бандл эти файлы всё равно не попадают: это .o, .so и заголовки C++.
 */
const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  /\/android\/build\/.*/,
  /\/android\/app\/build\/.*/,
  /\/android\/\.cxx\/.*/,
  /\/android\/app\/\.cxx\/.*/,
  // Те же каталоги внутри нативных модулей: reanimated, worklets, mmkv и
  // прочие собирают C++ прямо в node_modules.
  /\/node_modules\/[^/]+\/android\/build\/.*/,
  /\/node_modules\/[^/]+\/android\/\.cxx\/.*/,
  /\/ios\/(Pods|build)\/.*/,
];

module.exports = config;
