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

  test('creates a product @smoke', async ({ productsPage, page }) => {
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
- `describe` per feature; `beforeEach` for shared arrange; `test.step` for Given/When/Then.
- **Web-first assertions only.** No `waitForTimeout`, no `networkidle`.
- Keep a test under ~50 lines and to **one behavior** (SRP). Descriptive names (`creates X when Y`, not `test1`).

## Tagging — exactly one per test

`@smoke` (critical, fast) · `@sanity` · `@regression` (broad) · `@api` · `@e2e` · `@security` ·
`@destructive` (mutates shared state — runs `--workers=1`, **wins** over any other tag, requires cleanup).
Tag the `test`, never the `describe`. `npm run test:smoke` etc. filter by tag.

## Independence (parallel-safe)

- Tests run in any order, in parallel. No test depends on another's side effects.
- Create your own data (factory/helper fixture); clean it up in teardown (runs on failure).
- `@destructive` tests that touch shared state must restore it in `afterEach`/`afterAll`.

## Cleanup

Prefer API/fixture teardown over UI cleanup (faster, runs on failure). Never leave data behind.
