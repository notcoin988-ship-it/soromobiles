# Сторонние зависимости (§4.3)

Файл создаётся `npm run check:licenses -- --write`. Руками не править:
следующий запуск перезапишет.

§4.3 запрещает рекламные SDK, аналитику с идентификацией устройства,
трекеры и библиотеки с неясной лицензией. Проверка обходит всё дерево
зависимостей, не только прямые.

| Пакет | Версия | Лицензия |
| --- | --- | --- |
| `@expo-google-fonts/inter` | 0.4.2 | MIT AND OFL-1.1 |
| `@op-engineering/op-sqlite` | 17.1.5 | MIT |
| `@react-native-community/netinfo` | 12.0.1 | MIT |
| `@react-native-google-signin/google-signin` | 16.1.4 | MIT |
| `@react-native-masked-view/masked-view` | 0.3.2 | MIT |
| `@react-navigation/drawer` | 7.13.8 | MIT |
| `@react-navigation/native` | 7.3.16 | MIT |
| `@react-navigation/native-stack` | 7.18.8 | MIT |
| `@sentry/react-native` | 7.11.0 | MIT |
| `@shopify/flash-list` | 2.0.2 | MIT |
| `@tanstack/react-query` | 5.101.4 | MIT |
| `expo` | 57.0.12 | MIT |
| `expo-build-properties` | 57.0.10 | MIT |
| `expo-clipboard` | 57.0.1 | MIT |
| `expo-constants` | 57.0.10 | MIT |
| `expo-crypto` | 57.0.1 | MIT |
| `expo-device` | 57.0.1 | MIT |
| `expo-file-system` | 57.0.2 | MIT |
| `expo-font` | 57.0.1 | MIT |
| `expo-linear-gradient` | 57.0.1 | MIT |
| `expo-secure-store` | 57.0.1 | MIT |
| `expo-sqlite` | 57.0.1 | MIT |
| `expo-status-bar` | 57.0.1 | MIT |
| `expo-web-browser` | 57.0.2 | MIT |
| `i18next` | 25.10.10 | MIT |
| `lottie-react-native` | 7.3.8 | Apache-2.0 |
| `react` | 19.2.3 | MIT |
| `react-i18next` | 16.6.6 | MIT |
| `react-native` | 0.86.2 | MIT |
| `react-native-gesture-handler` | 2.32.0 | MIT |
| `react-native-markdown-display` | 7.0.2 | MIT |
| `react-native-mathjax-svg` | 0.9.9 | MIT |
| `react-native-mmkv` | 4.3.2 | MIT |
| `react-native-nitro-modules` | 0.36.5 | MIT |
| `react-native-reanimated` | 4.5.1 | MIT |
| `react-native-safe-area-context` | 5.7.0 | MIT |
| `react-native-screens` | 4.26.2 | MIT |
| `react-native-svg` | 15.15.4 | MIT |
| `react-native-worklets` | 0.10.1 | MIT |
| `zustand` | 5.0.14 | MIT |

## Разобранные вручную исключения

Транзитивные зависимости с лицензией вне разрешительного списка.

- `node-forge`@1.4.0 — (BSD-3-Clause OR GPL-2.0): двойная лицензия BSD-3-Clause ИЛИ GPL-2.0 — выбираем BSD-3-Clause. Приходит из @expo/code-signing-certificates, в APK не попадает.
- `lightningcss`@1.33.0 — MPL-2.0: MPL-2.0 (слабый копилефт на уровне файлов). Инструмент сборки из @expo/metro-config, компилирует CSS для веба; в мобильный бандл не входит.
- `@sentry/cli`@2.58.4 — FSL-1.1-MIT: FSL-1.1-MIT — не открытая лицензия, а source-available: запрещает конкурировать с Sentry, через два года превращается в MIT. Это инструмент СБОРКИ: заливает source maps из gradle- и xcode-скриптов, в APK и в JS-бандл не входит. ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ ЮРИСТА, потому что §4.3 запрещает «библиотеки с неясной лицензией».
- `react-native-fit-image`@1.5.5 — Beerware: Beerware — разрешительная лицензия без обязательств. Приходит из react-native-markdown-display и ПОПАДАЕТ в приложение. Требует формального согласования по §4.3.
