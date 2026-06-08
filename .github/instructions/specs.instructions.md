---
applyTo: 'tests/**'
---

# Spec structure & tagging (mirror of `.claude/skills/test-standards`)

- Import `{ test, expect }` from `fixtures/test-options` — never `@playwright/test` directly.
- Folder = project = system under test: `tests/functional/` (one screen), `tests/e2e/` (full journey), `tests/api/` (backend).
- Functional = many small tests, one behavior each (<50 lines). E2E = ONE test for the whole journey.
- `describe` per feature; `beforeEach` for arrange; `test.step` for Given/When/Then.
- **Web-first assertions only.** Assertions live in the spec, never the page object.
- **Exactly one tag per test**, via the structured option (Playwright 1.42+): `test('name', { tag: '@smoke' }, async …)` — not a `@tag` in the title. Tags: `@smoke` | `@sanity` | `@regression` | `@api` | `@e2e` | `@security` | `@destructive` (wins, runs `--workers=1`, must clean up). Tag the test, not the describe.
- Several independent checks in one test → `expect.soft(...)` so all failures surface at once.
- **Independence:** tests run in parallel, any order. Create your own data (factory/helper fixture), clean it up in teardown (runs on failure). No reliance on another test's side effects.
- Prefer API/fixture teardown over UI cleanup. Never leave data behind.
