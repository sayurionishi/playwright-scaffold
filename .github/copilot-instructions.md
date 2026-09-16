# GitHub Copilot — Repository Instructions

> **The hard stops below are GENERATED** from `rules/constitution.ts`, the single rule source that
> also generates `CLAUDE.md` §1 and `.github/instructions/*`. They cannot drift from what Claude
> sees — `npm run rules:check` fails CI if they do. Do not hand-edit the generated block.
>
> For rationale and worked examples, open the matching `.claude/skills/<name>/SKILL.md`; the
> path-scoped rules are in `.github/instructions/*`. Which rules are actually machine-enforced (as
> opposed to review-only) is in `docs/PARITY-MATRIX.md`.

This is an AI-native Playwright + TypeScript test scaffold. It tests **UI (functional + e2e)** and
**API**, with **security** coverage, via Page Object Model, fixture DI, deterministic waits, and
runtime-validated Zod schemas.

## First contact — bootstrap a fresh clone

If `PROJECT.md` exists, read it: it records the profile, auth model, locator priority, and
API-contract source, and overrides the defaults below.

If `PROJECT.md` does NOT exist, this is a fresh clone — **bootstrap it first**, don't generate tests yet:

1. **Interview** the user (don't decide silently): UI / API / both? App type → profile (`generic` /
   `controlled` / `salesforce` / `api-only`)? Auth (none / password / SSO)? OpenAPI spec? Base URL?
2. **API-only gate:** if the API itself is the system under test → send the user to
   **`sayurionishi/api-testing-scaffold`** (the companion repo: Python track pytest+httpx+Pydantic v2,
   TypeScript track Vitest+Zod) and stop. Other options: RestAssured, Schemathesis/Dredd. If the API
   calls only seed/clean state for UI tests, that is NOT api-only — stay here and use the `api` project.
3. **Apply the profile:** set locator priority (per profile). **Do not hand-delete projects** —
   `setup` only exists when `TEST_USER_EMAIL` is set and the UI projects derive `dependencies`/
   `storageState` from the same flag, so leave `auth.setup.ts` in place. Fill `env/.env.<env>`.
4. **`BASE_URL` is the app ROOT only** — no path segment (not `.../todomvc`), else `goto('/')` drops it.
   Paths go in `enums/util/routes.ts`.
5. **Example files — ASK, don't decide:** delete them, or keep as reference. If kept, MOVE the example
   specs (`tests/**/*.spec.ts`) out of `tests/` — they target a fake app and will run and FAIL otherwise.
6. **Write `PROJECT.md`** recording every decision.

## Hard stops (refuse to generate these)

<!-- BEGIN GENERATED: hard-stops — edit rules/constitution.ts, run npm run rules:generate -->

1. `page.waitForTimeout(...)` — Web-first assertion or a pre-registered response wait (`wait-strategy`)
2. `page.waitForLoadState('networkidle')` on an SPA — The specific gating response (`helpers/util/network.ts`). Acceptable ONLY on static/SSR pages that truly go quiet — never on a chatty SPA. On the `salesforce` profile this is a hard REFUSAL, not a discouragement (Aura never goes quiet). See `wait-strategy`.
3. XPath, CSS-class, nth-child, or auto-generated-id selectors — Semantic / testId per the active profile (`selectors`)
4. A guessed selector, URL, enum value, endpoint, or UI string — Explore first (playwright-cli / OpenAPI) or ASK. Never invent.
5. `any` type — A real type or `unknown` + narrowing (`type-safety`)
6. `z.object(...)` for an API schema — `z.strictObject(...)` (catches contract drift)
7. Skipping `expect(Schema.parse(body))` / `{ schema }` on an API response — Validate every response body
8. Assertions inside a page object — Page objects act; specs assert
9. Raw locators in a spec — Locators live in page objects only
10. `new SomePage(page)` inside a test — Consume via the fixture (`async ({ somePage }) => …`)
11. Hardcoded URL / credential — `process.env.*` via `config/`; paths & messages via `enums/`
12. `.json` static data — `.ts` with `as const`
13. Silencing a failure (`try/catch` on `expect`, raised timeout, silent `.skip`) — Fix the root cause; `test.skip` requires `// FIXME: <ticket>`
14. More than one tag per test — Exactly one (`@smoke`/`@sanity`/`@regression`/`@api`/`@e2e`/`@security`/`@contract`/`@persona`); `@destructive` wins
15. A Salesforce object or field API name written from memory — Read it from `describe` / `ui-api/object-info` (`salesforce-metadata-contract`) _(`salesforce` profile)_

<!-- END GENERATED: hard-stops -->

## Architecture

- `config/` URLs+secrets (env) · `enums/` paths/routes/messages · `helpers/` waits+auth · `pages/` POM · `test-data/` factories+static · `fixtures/` api+pom+helper+`test-options.ts` · `tests/` api/functional/e2e.
- **API / UI / E2E are separate Playwright projects**, not just folders. The seam is _what is the system under test_. API-as-setup is a fixture inside UI tests; API-as-SUT is the `api` project.
- Every spec imports from `@fixtures/test-options` — never from `@playwright/test` directly.
- **Never write `../` in an import.** Use the tsconfig aliases — `@pages` `@fixtures` `@helpers`
  `@enums` `@config` `@test-data` `@rules`. Lint fails on a climbing path. `./sibling` is fine.

## Workflow

Explore → propose scope with a confidence score (low confidence → ASK, don't guess) → on approval,
apply → run the affected test file → report. Run the affected file, never the whole suite. Red →
investigate the root cause.

## When NOT to use this for API testing

If the API itself is the system under test, use the companion scaffold
**`sayurionishi/api-testing-scaffold`** — deliberately not Playwright, with a Python track
(pytest + httpx + Pydantic v2) and a TypeScript track (Vitest + Zod). Other options: RestAssured,
Schemathesis/Dredd. Playwright's API mode here is for **API-as-setup** and modest same-stack
API-as-SUT suites that share types and fixtures with the UI tests.
