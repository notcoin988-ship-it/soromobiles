import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Версия и номер сборки (§13).
 *
 * «Экран „Дар бораи барнома“ показывает версию и номер сборки — чтобы
 * пользователь мог их назвать.»
 *
 * Раньше здесь были зашитые '1.0.0' и '1'. Смысл требования при этом
 * терялся полностью: человек называет версию, чтобы поддержка поняла, какая
 * сборка у него на руках, а зашитая строка одинакова во всех сборках и не
 * говорит ни о чём.
 *
 * Значения берутся из app.config.ts на этапе сборки: version — общая,
 * versionCode на Android и buildNumber на iOS — номер конкретной сборки.
 */

export const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

export const BUILD_NUMBER = String(
  (Platform.OS === 'android'
    ? Constants.expoConfig?.android?.versionCode
    : Constants.expoConfig?.ios?.buildNumber) ?? '—',
);
