# AGENTS.md

Cross-tool entry point for AI coding agents (Cursor, Zed, aider, Codex, and anything else that
reads `AGENTS.md`). Claude Code reads `CLAUDE.md`; GitHub Copilot reads
`.github/copilot-instructions.md`. All three are generated from the same rule source, so they agree.

This is an AI-native Playwright + TypeScript test-automation scaffold. It tests UI (functional and
e2e) and API, with security coverage, using the Page Object Model, fixture-based dependency
injection, deterministic waits, and runtime-validated Zod schemas.

**Before generating anything:** if `PROJECT.md` does not exist, this is an unconfigured fresh clone
— bootstrap it first (interview the user about the target app, pick a profile, record the
decisions). If it does exist, read it: it records the profile, auth model, locator priority, and
API-contract source, and it overrides the generic defaults.

<!-- BEGIN GENERATED: agents — edit rules/constitution.ts, run npm run rules:generate -->

## Hard stops (refuse to generate these)

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

## Where the detail lives

This file is deliberately thin. The full rules, with rationale and worked examples, are in:

- `CLAUDE.md` — the constitution, the workflow, and the skill index.
- `.claude/skills/<name>/SKILL.md` — one skill per topic, loaded on demand.
- `.github/instructions/*.instructions.md` — the same rules scoped to the paths they govern.
- `docs/PARITY-MATRIX.md` — which rules a tool actually blocks, and which are review-only.

Every one of those is generated from `rules/constitution.ts`, so they cannot disagree.

<!-- END GENERATED: agents -->
