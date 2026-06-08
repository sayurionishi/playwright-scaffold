import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      '.auth/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.mts'],
    rules: {
      /* ── Hard stops from the scaffold constitution ── */
      // No `any` — the type system is load-bearing here.
      '@typescript-eslint/no-explicit-any': 'error',
      // No floating promises — every Playwright action must be awaited.
      '@typescript-eslint/no-floating-promises': 'off', // enable once type-aware linting is wired
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    /* Playwright-specific rules apply to spec files only. */
    files: ['tests/**/*.spec.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      // waitForTimeout is banned outright — see wait-strategy skill.
      'playwright/no-wait-for-timeout': 'error',
      // networkidle: discouraged, not banned. It WARNS so it's flagged in review, but is
      // legitimately fine on static/SSR pages that go quiet. On an SPA, replace it with a
      // deterministic response wait. Justify any kept use with an inline comment. See wait-strategy.
      'playwright/no-networkidle': 'warn',
      // Assertions belong in specs, never in page objects.
      'playwright/no-standalone-expect': 'off',
      'playwright/expect-expect': 'warn',
    },
  },
);
