import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Три инварианта ТЗ, которые должны падать в CI, а не жить в договорённостях.
 *
 * Требует девзависимостей: eslint, @eslint/js, typescript-eslint,
 * eslint-plugin-i18next. Ставятся отдельно:
 *   npm i -D eslint @eslint/js typescript-eslint eslint-plugin-i18next
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'dist/**',
      // Сгенерированный вывод сборки тестов — линтить нечего.
      '.test-build/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    // Конфиги в корне — CommonJS-скрипты для Node, а не код приложения.
    files: ['*.js', '*.cjs'],
    languageOptions: {
      globals: { require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    rules: {
      // §5.3: никаких console.* в релизной сборке. Babel их вырезает, но
      // ловить надо раньше — на ревью, а не в бандле.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    // §5.2: design/tokens.ts — ЕДИНСТВЕННОЕ место, где допускаются hex-литералы.
    // В компонентах только ссылки на токены, иначе тема поедет и светлая
    // версия разъедется с вебом.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/design/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]',
          message:
            'Hex-цвета допускаются только в src/design/tokens.ts (§5.2). Используйте токен темы.',
        },
        {
          selector: 'TemplateElement[value.raw=/#[0-9a-fA-F]{6}/]',
          message: 'Hex-цвета допускаются только в src/design/tokens.ts (§5.2).',
        },
      ],
    },
  },

  {
    // §9: ни одной строки интерфейса в коде компонентов — всё через i18n.
    // Проверяется линтером, потому что «0 непереведённых ключей» — критерий
    // приёмки §17, а не пожелание.
    files: ['src/**/*.tsx'],
    plugins: {
      i18next: (await import('eslint-plugin-i18next')).default,
    },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-text-only',
          'should-validate-template': true,
        },
      ],
    },
  },

  {
    // В тестах и заглушках оба запрета сняты: там литералы — это и есть предмет
    // проверки.
    files: ['src/**/__tests__/**/*.ts', 'src/test/**/*.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'i18next/no-literal-string': 'off',
      'no-console': 'off',
    },
  },

  {
    // Статические ресурсы в React Native подключаются ТОЛЬКО через require:
    // Metro разрешает пути к картинкам и Lottie на этапе сборки, и import
    // здесь не работает — бандлер не найдёт файл. Исключение точечное: один
    // файл, где собраны все обращения к ресурсам логотипа.
    files: ['src/design/Logo.tsx', 'src/design/CrystalField.tsx', 'src/design/GlowField.tsx', 'src/design/Facets.tsx'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    // features/chat/mathjax.ts — require здесь не стилистика, а способ
    // отложить инициализацию MathJax до первой формулы: статический import
    // исполнил бы её при запуске приложения и съел бюджет холодного старта
    // из §12. Подробности — в комментарии самого файла.
    files: ['src/features/chat/mathjax.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  // ВАЖНО: этот блок должен идти ПОСЛЕДНИМ. В плоском конфиге ESLint побеждает
  // последнее совпадение, и общий запрет console.* выше иначе перекроет
  // исключение — на этом конфиг уже попадался.
  {
    // scripts/ — инструменты для CI, plugins/ — config-плагины Expo. И то и
    // другое исполняется в Node, а не в приложении: console и process здесь
    // интерфейс, а require — единственный доступный способ импорта.
    // Запрет console.* из §5.3 относится к коду приложения, а не к ним.
    files: ['scripts/**', 'plugins/**'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        // Node 18+ даёт их глобально; контрактный тест ходит по HTTP.
        fetch: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
