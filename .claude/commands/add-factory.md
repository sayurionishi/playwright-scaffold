---
description: Add a test-data factory or curated invalid-input set.
---

Add test data for **<entity>**.

Load the `data-strategy` skill (or `salesforce-data` for org records).

First decide WHICH KIND, because they live in different places and mixing them is the usual mistake:

- **Dynamic happy-path values** → a Faker factory in `test-data/factories/`. Takes
  `(overrides, seed?)`, spreads `overrides` last, and gets its generator from `fakerFor(seed)` —
  never `faker.seed()` directly, which mutates a module-global and de-randomises every later test
  in the worker.
- **Curated invalid / boundary inputs** → `test-data/static/`, `as const`. These are chosen
  values, not random ones; randomness would make a negative test non-reproducible.

Then:

1. `.ts` with `as const` — never `.json` (#12, guard-script enforced).
2. Unique values where a uniqueness constraint or a duplicate rule exists.
3. Export a type alongside the data, so a consuming spec stays typed.
4. Verify with `npm run lint && npm run typecheck && npm run guard`.

If the user has not already said **the entity or payload**, ask before starting.
