import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * CONSTITUTION ENFORCEMENT
 *
 * `rules/constitution.ts` is the rule source; `docs/PARITY-MATRIX.md` (generated) records which
 * rules are mechanically blocking. Every `no-restricted-syntax` message below cites its rule
 * number, so a lint failure points straight at the rule it broke.
 *
 * Keep the two in step: if you change enforcement here, update the rule's `enforcement` field and
 * run `npm run rules:generate`, or the matrix will misdescribe reality — which is the failure this
 * whole mechanism exists to prevent.
 *
 * CI lints with `--max-warnings=0`, so a 'warn' here still fails the build. 'warn' vs 'error' now
 * only signals intent to a human reading the config.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Rule #3 — no XPath, CSS-class, nth-child, or auto-generated-id selectors. */
const NO_FRAGILE_SELECTORS = [
  {
    // A string literal handed to `.locator()` that starts with `.`, `#`, or `//`.
    selector:
      'CallExpression[callee.property.name="locator"] > Literal[value=/^\\s*(\\.[a-zA-Z_-]|#[a-zA-Z_-]|\\/\\/)/]',
    message:
      'Constitution #3: CSS-class, id, or XPath selector. Use a semantic locator (getByRole / ' +
      'getByLabel / getByText) or getByTestId per the active profile. See the `selectors` skill.',
  },
  {
    selector: 'Literal[value=/nth-child|nth-of-type/]',
    message:
      'Constitution #3: positional CSS selector. Position changes with content — scope to a ' +
      'container and locate semantically instead. See the `selectors` skill.',
  },
];

/** Rule #1 — no blind sleeps. */
const NO_BLIND_SLEEP = [
  {
    selector: 'CallExpression[callee.property.name="waitForTimeout"]',
    message:
      'Constitution #1: waitForTimeout is banned. Use a web-first assertion, a pre-registered ' +
      'response wait (helpers/util/network.ts), or expect.poll for a condition that settles. ' +
      'See the `wait-strategy` skill.',
  },
];

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      // The blob reporter's output dir. Absent from ignores originally, so `eslint .` broke the
      // moment anyone used blob reporting.
      'blob-report/**',
      '.auth/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    /* Type-aware linting. Required for `no-floating-promises`, which is THE rule for this codebase:
       the core idiom is `const p = waitForX(); await action(); await p;` and a dropped `await p`
       is invisible, producing exactly the flake the scaffold exists to prevent.

       ⚠️ `files` is load-bearing. Without it the project service also tries to type-check this
       config file, which is not in tsconfig.json, and every run fails with
       "eslint.config.mjs was not found by the project service". Type-aware linting applies to the
       TypeScript sources only. */
    files: ['**/*.ts', '**/*.mts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.mts'],
    rules: {
      /* ── Constitution #5 ── */
      '@typescript-eslint/no-explicit-any': 'error',
      /* ── Constitution #1 (companion to #13) ── every Playwright action must be awaited ── */
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    /* Claude Code hook scripts are plain Node ESM run by the harness, not part of the TS build, so
       they are outside tsconfig and ESLint does not know Node's globals here. Declaring them beats
       adding a dependency for four names. */
    files: ['.claude/hooks/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },
  {
    /* Standalone CLI scripts print to stdout — that IS their interface. `no-console` exists to keep
       stray debugging out of the suite, not to stop a generator reporting what it wrote. */
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    /* The rule source describes forbidden patterns in prose and selector strings, so the bans
       below would flag their own documentation. */
    files: ['rules/**/*.ts', 'eslint.config.mjs'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    /* Fixture files must use `async ({}, use) => …` for a fixture with no dependencies.
       Playwright INSPECTS the destructuring pattern to resolve a fixture's dependency graph and
       rejects a plain parameter name outright ("First argument must use the object destructuring
       pattern"). So the empty pattern is load-bearing, not a style slip. */
    files: ['fixtures/**/*.ts'],
    rules: { 'no-empty-pattern': 'off' },
  },

  /* ── Rule #1 and #2, EVERYWHERE they apply ────────────────────────────────────────────────────
     Previously the Playwright rules were scoped to `tests/**\/*.spec.ts` only, so a sleep or a
     networkidle wait inside a page object, helper or fixture was not linted at all — the exact
     directories `page-objects` tells you to put waits in. Verified with `eslint --print-config`:
     zero playwright rules were active for `pages/`. This block closes that gap. */
  {
    files: ['pages/**/*.ts', 'helpers/**/*.ts', 'fixtures/**/*.ts'],
    plugins: { playwright },
    rules: {
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-networkidle': 'warn',
      'no-restricted-syntax': [...NO_BLIND_SLEEP, ...NO_FRAGILE_SELECTORS].reduce(
        (acc, r) => [...acc, r],
        ['error'],
      ),
    },
  },

  /* ── Rule #8: page objects act, specs assert ─────────────────────────────────────────────────
     `playwright/no-standalone-expect` does NOT cover this (see below), so this is the mechanism. */
  {
    files: ['pages/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_BLIND_SLEEP,
        ...NO_FRAGILE_SELECTORS,
        {
          selector: 'CallExpression[callee.name="expect"]',
          message:
            'Constitution #8: no assertions in a page object. Page objects act and expose ' +
            'locators; the spec asserts. Return the locator and assert on it in the test.',
        },
        {
          selector: 'CallExpression[callee.object.name="expect"]',
          message:
            'Constitution #8: no assertions in a page object (expect.soft / expect.poll included). ' +
            'Page objects act and expose locators; the spec asserts.',
        },
      ],
    },
  },

  /* ── Specs ───────────────────────────────────────────────────────────────────────────────────*/
  {
    files: ['tests/**/*.spec.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      /* Rule #2 is profile-dependent: a hard refusal on `salesforce` and any chatty SPA, but
         legitimate on a static/SSR page that truly goes quiet. 'warn' plus CI's --max-warnings=0
         means it blocks by default, and a genuine static-page use must be justified with an
         inline disable directive stating why that page goes quiet.

         (Do not write that directive's name in a line comment here — ESLint parses disable
         directives in this file too, and a comment mentioning one is read as a real directive
         for a rule that does not exist.) */
      'playwright/no-networkidle': 'warn',
      /* ⚠️ This does NOT enforce Constitution #8 — read before assuming it does.

         `no-standalone-expect` flags an `expect()` outside a `test()` body. It is off because this
         repo deliberately asserts through shared helpers (see `expect-expect` below), which the
         rule would flag. And even on, it would not catch an `expect()` inside a page-object METHOD,
         which is what #8 actually forbids. That is enforced by the `pages/**` block above. */
      'playwright/no-standalone-expect': 'off',
      /* The Salesforce contract layer asserts through shared helpers so one run reports every
         drifted field instead of stopping at the first. Teach the rule to recognise them —
         otherwise it reports "test has no assertions" on the most assertion-dense tests here. */
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
      'no-restricted-syntax': [
        'error',
        ...NO_BLIND_SLEEP,
        ...NO_FRAGILE_SELECTORS,
        /* Rule #9 — no raw locator of ANY kind in a spec.

           This started as `.locator()` only, because `test-standards` demonstrated
           `page.getByText(...)` in a spec and I did not want the rule fighting the documented
           style. But the Constitution says "locators live in page objects only" without
           qualification, so the skill's example was the thing that was wrong — and by the repo's
           own rule ("when a rule and the code disagree, that's a bug"), the example changed. Once
           the missing page objects existed, zero specs needed a raw locator.

           `page.waitForURL` and `page.goto` are deliberately NOT matched: those are navigation and
           URL assertions, which `base.page.ts` explicitly says belong to the spec. */
        {
          selector: 'CallExpression[callee.property.name="locator"]',
          message:
            'Constitution #9: no raw locators in a spec. Locators live in page objects — add it ' +
            'there as a class field and consume the page object via its fixture.',
        },
        {
          selector: 'CallExpression[callee.property.name=/^getBy/][callee.object.name="page"]',
          message:
            'Constitution #9: no raw locators in a spec, getBy* included. Expose it as a locator ' +
            'field on the page object and assert on that (e.g. `productsPage.rowByName("Widget")`).',
        },
        {
          // Rule #10.
          selector: 'NewExpression[callee.name=/(Page|Component)$/]',
          message:
            'Constitution #10: do not construct a page object in a test. Register it in ' +
            'fixtures/pom/page-object-fixture.ts and consume it via destructuring: ' +
            'async ({ somePage }) => … . See the `fixtures` skill.',
        },
        {
          // Rule #11.
          selector: 'Literal[value=/^https?:\\/\\//]',
          message:
            'Constitution #11: no hardcoded URL. Read the host from config/ (process.env) and the ' +
            'path from enums/. See the `config` and `enums` skills.',
        },
        {
          // Rule #13 — a try/catch wrapped around an assertion turns a failure into a pass.
          selector: 'TryStatement:has(CallExpression[callee.name="expect"])',
          message:
            'Constitution #13: never wrap an assertion in try/catch — it silences the failure. ' +
            'Fix the root cause; if it is a known bug, test.skip with a // FIXME: <ticket>.',
        },
        {
          // Rule #13 — an empty catch swallows a real error with no trace.
          selector: 'CatchClause > BlockStatement:not(:has(*))',
          message:
            'Constitution #13: empty catch block. Swallowing an error hides the failure. If the ' +
            'throw is genuinely expected and irrelevant, say so in a comment inside the block.',
        },
        {
          // Rule #13 — raising a timeout to make a red test pass.
          selector: 'CallExpression[callee.property.name="setTimeout"][callee.object.name="test"]',
          message:
            'Constitution #13: raising a test timeout to make it pass is silencing a failure. Use ' +
            'test.slow() for a genuinely slow test, and only with a comment saying why.',
        },
        {
          // Rule #14 — exactly one tag per test.
          selector: 'Property[key.name="tag"] > ArrayExpression',
          message:
            'Constitution #14: exactly one tag per test. Use the string form: { tag: "@smoke" }. ' +
            'If a test needs two categories it is doing too much — split it.',
        },
      ],
    },
  },

  /* ── Rule #6: strictObject catches contract drift ────────────────────────────────────────────*/
  {
    files: ['fixtures/**/*.ts', 'test-data/**/*.ts', 'helpers/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_BLIND_SLEEP,
        /* Rule #6. These match `z.object(...)` used DIRECTLY as a schema value — i.e. the actual
           mistake of reaching for the non-strict builder by habit.

           They deliberately do NOT match `z.object(...).catchall(z.unknown())`, because that chain
           is an explicit, self-documenting opt-in to a permissive schema, and there are legitimate
           uses of it here: a Salesforce `describe` payload and `GET /limits` both grow new keys
           every release, and failing a run because Salesforce added a field to its own metadata
           response is not drift worth catching. Flagging those would have meant scattering
           disable directives over correct code, which trains people to ignore the rule.

           Verified against a probe file: the bare and inline forms are flagged, the `.catchall`
           and `strictObject` forms are not. */
        {
          selector:
            'VariableDeclarator > CallExpression[callee.object.name="z"][callee.property.name="object"]',
          message:
            'Constitution #6: use z.strictObject, not z.object. A non-strict schema silently ' +
            'accepts extra keys, so contract drift — and a field SILENTLY OMITTED by field-level ' +
            'security — passes validation. If the schema must be permissive, say so explicitly by ' +
            'chaining .catchall(z.unknown()) and add a comment giving the reason.',
        },
        {
          selector:
            'Property[key.name="schema"] > CallExpression[callee.object.name="z"][callee.property.name="object"]',
          message:
            'Constitution #6: use z.strictObject, not z.object for an inline response schema. If ' +
            'it must be permissive, chain .catchall(z.unknown()) and comment why.',
        },
      ],
    },
  },
);
