---
name: fixtures
description: Use when wiring a page object into dependency injection, sharing setup/teardown across tests, or adding a new fixture category. Defines the fixture layering and the single import point.
---

# Fixtures

Fixtures give auto-init and auto-cleanup. Three layers, merged into one import point.

```
fixtures/
├── api/    api-fixture.ts (the `api` client) + api-request.ts + schemas/
├── pom/    page-object-fixture.ts (page object DI)
├── helper/ helper-fixture.ts (setup/teardown lifecycle)
└── test-options.ts  ← mergeTests(...) — the ONLY thing specs import
```

Every spec: `import { test, expect } from '<...>/fixtures/test-options';`
Importing `test` from `@playwright/test` directly is a bug — it bypasses all custom fixtures.

## Page-object fixtures

Register each page object once in `pom/page-object-fixture.ts`:

```ts
productsPage: async ({ page }, use) => { await use(new ProductsPage(page)); },
```

Add `await productsPage.goto()` before `use` ONLY if every consumer starts on that page. Tests then
destructure `{ productsPage }` — never `new`.

## Helper fixtures (setup/teardown)

Setup → `await use(data)` → teardown. The teardown half runs even on failure, so data never leaks.

```ts
seededUser: async ({ request }, use) => {
  const user = await create(...);   // setup
  await use(user);
  await delete(user.id).catch(() => {});  // teardown, best-effort
},
```

**Promotion rule:** create a helper fixture only when the same setup/teardown is reused across **3+
files**. Otherwise call `api` directly in the test — don't over-fixture.

## New category

`base.extend<MyFixtures>({...})` in its own file, then add it to the `mergeTests(...)` in `test-options.ts`.

## Don't

- Don't put assertions in fixtures.
- Don't share mutable state between tests via fixtures (breaks parallelism/independence).
