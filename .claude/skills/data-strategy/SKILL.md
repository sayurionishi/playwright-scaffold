---
name: data-strategy
description: Use when you need test data — dynamic happy-path values (Faker factories) or curated invalid/boundary inputs (static). Defines where each kind of value lives.
---

# Data Strategy

One right home per kind of value. No hardcoded test content in specs.

## Classify the value

| Kind                                                     | Home                                      | Form                               |
| -------------------------------------------------------- | ----------------------------------------- | ---------------------------------- |
| Dynamic happy-path (a valid user, product, payload)      | `test-data/factories/{area}/*.factory.ts` | Faker + typed output               |
| Universal invalid / malicious (type-mismatch, SQLi, XSS) | `test-data/static/util/invalid-values.ts` | `as const`; import, never redefine |
| Domain-specific invalid set                              | `test-data/static/{area}/*.ts`            | `as const`                         |
| One-off field boundary (this test only)                  | inline in the test                        | literal                            |

## Factories

- Faker-based, return a typed object, accept `overrides` and an optional `seed` for reproducibility.
- Produce **valid** happy-path data. Invalid data does NOT belong in a factory.

```ts
export function makeUser(overrides: Partial<NewUser> = {}, seed?: number): NewUser { … }
```

- Consume in payloads/content: `await api.post(path, { data: makeUser({ email: pinned }) })`.

## Static data (the three-tier rule)

- **`.ts` with `as const`** only — never `.json`, never logic.
- Universal sets live once in `static/util/` and are imported everywhere (don't copy arrays into specs).
- Drive `for…of` loops over them in format-error / security tests.

## Don't

- No `Date.now()`-based uniqueness collisions across parallel workers — prefer Faker or a per-test seed.
- No arrays/objects >3 items hardcoded in a spec — externalize.
- No invalid values mixed into factories.
