---
applyTo: 'tests/**'
---

# Spec structure & tagging (mirror of `.claude/skills/test-standards`)

<!-- BEGIN GENERATED: rules — edit rules/constitution.ts, run npm run rules:generate -->

- **Rule #4** — A guessed selector, URL, enum value, endpoint, or UI string. **Explore first** (playwright-cli / OpenAPI) or **ASK**. Never invent.
- **Rule #9** — Raw locators in a spec. Locators live in page objects only
- **Rule #10** — `new SomePage(page)` inside a test. Consume via the fixture (`async ({ somePage }) => …`)
- **Rule #11** — Hardcoded URL / credential. `process.env.*` via `config/`; paths & messages via `enums/`
- **Rule #12** — `.json` static data. `.ts` with `as const`
- **Rule #13** — Silencing a failure (`try/catch` on `expect`, raised timeout, silent `.skip`). Fix the root cause; `test.skip` requires `// FIXME: <ticket>`
- **Rule #14** — More than one tag per test. Exactly one (`@smoke`/`@sanity`/`@regression`/`@api`/`@e2e`/`@security`/`@contract`/`@persona`); `@destructive` wins

<!-- END GENERATED: rules -->

- Import `{ test, expect }` from `@fixtures/test-options` — never `@playwright/test` directly.
- No `../` in imports: use `@pages` / `@fixtures` / `@helpers` / `@enums` / `@config` / `@test-data`.
- Folder = project = system under test: `tests/functional/` (one screen), `tests/e2e/` (full journey), `tests/api/` (backend).
- Functional = many small tests, one behavior each (<50 lines). E2E = ONE test for the whole journey.
- `describe` per feature; `beforeEach` for arrange; `test.step` for Given/When/Then.
- **Web-first assertions only.** Assertions live in the spec, never the page object.
- **Exactly one tag per test**, via the structured option (Playwright 1.42+): `test('name', { tag: '@smoke' }, async …)` — not a `@tag` in the title. Tags: `@smoke` | `@sanity` | `@regression` | `@api` | `@e2e` | `@security` | `@destructive` (wins, runs `--workers=1`, must clean up). Tag the test, not the describe.
- Several independent checks in one test → `expect.soft(...)` so all failures surface at once.
- **Independence:** tests run in parallel, any order. Create your own data (factory/helper fixture), clean it up in teardown (runs on failure). No reliance on another test's side effects.
- Prefer API/fixture teardown over UI cleanup. Never leave data behind.
