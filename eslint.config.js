import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'screenshots', 'node_modules', 'src/pdf/metrics.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // TRAP: a test *about* zero-width characters that contains real ones
      // trips this rule. Write them as \u200B-style escapes instead — visible
      // in a diff, and lint-clean. scripts/check-invisible.mjs enforces this
      // across the whole repo, including files eslint does not cover.
      'no-irregular-whitespace': ['error', { skipStrings: false, skipTemplates: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js'],
    languageOptions: {
      // Both: these scripts run in Node, but the bodies passed to
      // page.evaluate() and page.addInitScript() are serialised and executed
      // in the browser, so they legitimately reference document/localStorage.
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
