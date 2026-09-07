import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**', '.auth/**'],
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
    /* Standalone CLI scripts print to stdout — that IS their interface. `no-console` exists to keep
       stray debugging out of the suite, not to stop a generator reporting what it wrote. This
       override matters because CI lints with `--max-warnings=0`: without it, every script would
       have to either stay silent or disable the rule inline. */
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    /* Fixture files must use `async ({}, use) => …` for a fixture with no dependencies.
       Playwright INSPECTS the destructuring pattern to resolve a fixture's dependency graph and
       rejects a plain parameter name outright ("First argument must use the object destructuring
       pattern"). So the empty pattern is load-bearing, not a style slip. */
    files: ['fixtures/**/*.ts'],
    rules: {
      'no-empty-pattern': 'off',
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
      /* ⚠️ This does NOT enforce Constitution #8 ("no assertions in a page object") — read on
         before assuming it does.

         `no-standalone-expect` flags an `expect()` that is not inside a `test()` body. It is off
         because this repo deliberately asserts through shared helpers (see `expect-expect` below),
         which the rule would flag as violations. Turning it on would break the contract layer, and
         leaving it on would still not catch an `expect()` inside a page-object METHOD — which is
         what #8 actually forbids.

         So #8 is currently REVIEW-ONLY. A `no-restricted-syntax` rule scoped to `pages/**` is the
         mechanism that would enforce it. */
      'playwright/no-standalone-expect': 'off',
      /* The Salesforce contract layer asserts through shared helpers (assertObjectShape,
         assertFieldAccess, assertVisibleFieldSet, …) so that one run reports every drifted field
         instead of stopping at the first. Teach the rule to recognise them — otherwise it reports
         "test has no assertions" on the most assertion-dense tests in the suite. */
      'playwright/expect-expect': [
        'warn',
        {
          assertFunctionNames: [
            'expect',
            'assertObjectShape',
            'assertFieldShape',
            'assertObjectCrud',
            'assertFieldAccess',
            'assertVisibleFieldSet',
          ],
        },
      ],
    },
  },
);
