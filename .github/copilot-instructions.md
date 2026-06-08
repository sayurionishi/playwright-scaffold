# GitHub Copilot — Repository Instructions

> **Mirror of the canonical AI rules.** The authoritative source is `CLAUDE.md` + `.claude/skills/**`.
> If this file and a skill disagree, the **skill wins**. These mirrors may lag — when in doubt, open
> the matching `.claude/skills/<name>/SKILL.md`. Path-scoped detail lives in `.github/instructions/*`.

This is an AI-native Playwright + TypeScript test scaffold. It tests **UI (functional + e2e)** and
**API**, with **security** coverage, via Page Object Model, fixture DI, deterministic waits, and
runtime-validated Zod schemas.

## First contact

If `PROJECT.md` does not exist, this is a fresh clone — the user must run the bootstrap step first
(it picks a profile and tailors the scaffold). If `PROJECT.md` exists, read it: it records the
profile, auth model, locator priority, and API-contract source, and overrides the defaults below.

## Hard stops (refuse to generate these)

1. `page.waitForTimeout(...)` — use a web-first assertion or a pre-registered response wait.
2. `page.waitForLoadState('networkidle')` **on an SPA** — use the specific gating response. (Fine only on static/SSR pages that go quiet.)
3. XPath / CSS-class / nth-child / auto-generated-id selectors — use semantic or testId per the active profile.
4. A guessed selector, URL, endpoint, enum, or UI string — explore first (live app / OpenAPI) or ASK. Never invent.
5. `any` — use a real type or `unknown` + narrowing.
6. `z.object(...)` for an API schema — use `z.strictObject(...)`.
7. Skipping response validation — validate every API body with a Zod schema.
8. Assertions inside a page object — page objects act; specs assert.
9. Raw locators in a spec — locators live in page objects only.
10. `new SomePage(page)` in a test — consume via the fixture.
11. Hardcoded URL/credential — `process.env.*` via `config/`; paths & messages via `enums/`.
12. `.json` static data — `.ts` with `as const`.
13. Silencing a failure (try/catch on `expect`, raised timeout, silent `.skip`) — fix the root cause; `.skip` needs `// FIXME: <ticket>`.
14. More than one tag per test — exactly one; `@destructive` wins.

## Architecture

- `config/` URLs+secrets (env) · `enums/` paths/routes/messages · `helpers/` waits+auth · `pages/` POM · `test-data/` factories+static · `fixtures/` api+pom+helper+`test-options.ts` · `tests/` api/functional/e2e.
- **API / UI / E2E are separate Playwright projects**, not just folders. The seam is _what is the system under test_. API-as-setup is a fixture inside UI tests; API-as-SUT is the `api` project.
- Every spec imports from `fixtures/test-options` — never from `@playwright/test` directly.

## Workflow

Explore → propose scope with a confidence score (low confidence → ASK, don't guess) → on approval,
apply → run the affected test file → report. Run the affected file, never the whole suite. Red →
investigate the root cause.

## When NOT to use this for API testing

A large, pure-API suite where the API is the SUT and the backend is non-TypeScript → recommend a
backend-native tool (pytest+Pydantic, RestAssured, Schemathesis/Dredd), not Playwright.
