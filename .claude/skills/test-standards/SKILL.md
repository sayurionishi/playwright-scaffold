---
name: test-standards
description: Use when writing a new spec file, structuring functional vs e2e tests, choosing tags, or deciding what belongs in a test. Defines spec structure, tagging, and independence.
---

# Test Standards (spec structure)

## Which project / folder

| Type                            | Folder → project                   | The SUT        |
| ------------------------------- | ---------------------------------- | -------------- |
| One screen/feature in isolation | `tests/functional/` → `functional` | a single page  |
| Full multi-feature journey      | `tests/e2e/` → `e2e`               | the whole flow |
| Backend endpoint                | `tests/api/` → `api`               | the API        |

Functional = many small tests, one behavior each. E2E = ONE test for the whole journey (not one per step).

## Structure

```ts
import { test, expect } from '../../fixtures/test-options';

test.describe('Products', () => {
  test.beforeEach(async ({ productsPage }) => {
    await productsPage.goto();
  });

  test('creates a product', { tag: '@smoke' }, async ({ productsPage, page }) => {
    await test.step('When I add a product', async () => {
      await productsPage.addProduct('Widget');
    });
    await test.step('Then it appears in the list', async () => {
      await expect(page.getByText('Widget')).toBeVisible();
    });
  });
});
```

- Import from `fixtures/test-options` only.
- `describe` per feature; `beforeEach` for shared arrange; `test.step` to label the beats.

### AAA or Given/When/Then — both fine

`test.step` labels are for the human reading the report. Use **either** vocabulary — they are the
same three-beat shape, so pick whichever reads better and **stay consistent within a file**:

| Arrange | Act  | Assert | ← AAA (the api specs use this) |
| ------- | ---- | ------ | ------------------------------ |
| Given   | When | Then   | ← BDD (the UI specs use this)  |

```ts
// AAA
await test.step('Act: create the user', async () => { … });
await test.step('Assert: 201 and body matches the contract', async () => { … });

// BDD
await test.step('When I submit wrong credentials', async () => { … });
await test.step('Then I see an error and stay on /login', async () => { … });
```

- Steps are **optional**. Use them when a test has distinct beats worth labeling; **skip them on
  single-action tests** (a one-line GET + status check reads fine without a wrapper) — don't pad.
- The `Act` step can `return` the call's result so the `Assert` step uses it (see `tests/api/users.spec.ts`).
- **Web-first assertions only.** No `waitForTimeout`, no `networkidle`.
- Keep a test under ~50 lines and to **one behavior** (SRP). Descriptive names (`creates X when Y`, not `test1`).
- For several independent checks in one test, use **soft assertions** (`expect.soft(...)`) so all failures report at once instead of stopping at the first. ([docs](https://playwright.dev/docs/test-assertions#soft-assertions))

## Tagging — exactly one per test

Use the **structured tag option** (Playwright 1.42+) — `test('name', { tag: '@smoke' }, async …)` — not a tag baked into the title. It's the modern form and keeps titles clean. (A `@tag` in the title still works with `--grep`, but prefer the option.)

`@smoke` (critical, fast) · `@sanity` · `@regression` (broad) · `@api` · `@e2e` · `@security` ·
`@contract` (a shape/metadata snapshot, not behavior) · `@persona` (who can see/do what) ·
`@destructive` (mutates shared state — runs `--workers=1`, **wins** over any other tag, requires cleanup).
Tag the `test`, never the `describe`. `npm run test:smoke` etc. filter by tag via `--grep`.
([tag docs](https://playwright.dev/docs/test-annotations#tag-tests))

`@contract` and `@persona` exist mainly for the `salesforce` profile, where metadata drift and the
permission matrix are distinct test types you want to run on their own cadence — contract checks on every
push, the persona matrix before a permissions release. They're profile-agnostic though: any app with a
generated contract or a role model can use them. See `salesforce-metadata-contract` / `salesforce-personas`.

## Independence (parallel-safe)

- Tests run in any order, in parallel. No test depends on another's side effects.
- Create your own data (factory/helper fixture); clean it up in teardown (runs on failure).
- `@destructive` tests that touch shared state must restore it in `afterEach`/`afterAll`.

## Cleanup

Prefer API/fixture teardown over UI cleanup (faster, runs on failure). Never leave data behind.
