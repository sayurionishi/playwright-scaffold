# AI Task Workflows — Step-by-Step Playbook

The **map** of how each task is executed. `CLAUDE.md` is the constitution; the `.claude/skills/**`
own the deep rules; this file is the orchestration map that keeps every task on the same path.
If this map and a skill disagree, the **skill wins**.

`{area}` is a placeholder (e.g. `products`) — resolve it with `ls` first, never guess.

---

## The Universal Spine (every non-trivial task)

| #   | Phase                                                                         | Gate                                               |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | **Classify** intent (bootstrap / page object / test / API / debug / refactor) | —                                                  |
| 2   | **Route** to the first skill (CLAUDE.md §4)                                   | —                                                  |
| 3   | **Explore** — playwright-cli for UI, OpenAPI for API, `ls` for conventions    | Missing a primary input → **ASK**                  |
| 4   | **Propose** — scope + files + trade-offs + **confidence 1–10**                | Confidence < 5 → don't propose, return to P3 + ASK |
| 5   | **Human gate** — approve / modify / reject                                    | No code before approval                            |
| 6   | **Apply** — per the leaf skill; re-check every Constitution rule              | —                                                  |
| 7   | **Verify** — lint + run the affected file only                                | Red → `debugging`; never suppress                  |
| 8   | **Report + commit** — files changed; ask before committing                    | Commit only on request                             |

**Confidence gate:** `< 5` = guessing, ASK. `5–7` = real trade-off, propose with explicit unknowns.
`≥ 8` = full evidence. `≥ 9` = exact spec match, no ambiguity.

**Proposal block:**

```
## Proposal
- Scope: <files + what changes>
- Trade-offs: <if any>
- Confidence: <1-10> (<low|medium|high>)
- Unknowns: <list or "none">
```

---

## Flow 0 — Bootstrap a fresh clone

**Use when:** `PROJECT.md` does not exist. **Skill:** `bootstrap`.

1. Interview: UI / API / both? App type (generic / controlled-source / Salesforce)? Auth model? Is there an OpenAPI/Swagger contract?
2. **API-only check** — if it's a large pure-API suite on a non-TS backend, recommend a backend-native tool (`api-testing` P1 / CLAUDE.md §5) and stop.
3. Select the profile; apply it: set selector priority, wire or remove `auth.setup.ts`, prune unused projects in `playwright.config.ts`, fill `env/.env.<env>`.
4. Write `PROJECT.md` (profile + decisions + target facts).
5. Hand off to the first real task (usually a page object or an API suite).

---

## Flow 1 — Page object for a new screen

**Skill:** `page-objects` → `selectors`, `fixtures`, `enums`

1. `ls pages/` to resolve `{area}` and avoid duplicates.
2. **Explore the live screen** with playwright-cli (`navigate`, `snapshot`). No codegen, no guessing.
3. Propose: which locators (by profile priority), which actions, which feedback elements (success/error/validation).
4. Build the class: extends `BasePage`, locators-on-top, actions only (no asserts), deterministic waits inside actions.
5. Register it in `fixtures/pom/page-object-fixture.ts`.
6. Consume via the fixture in tests — never `new`.

---

## Flow 2 — Functional test (one screen is the SUT)

**Skill:** `test-standards` → `page-objects`, `data-strategy`

1. Split the ticket into discrete behaviors → one test per behavior.
2. New elements? Explore with playwright-cli first.
3. Propose scenarios + the single tag for each + data needs.
4. Page object provides locators/actions; content from Faker factories; invalid sets from static tiers.
5. Spec: import from `fixtures/test-options`; `describe` + `beforeEach`; `test.step` Given/When/Then; web-first assertions; one tag.
6. Run `playwright test tests/functional/<file> --project=functional`. Red → `debugging`.

---

## Flow 3 — E2E journey (full flow is the SUT)

**Skill:** `test-standards` → `page-objects`, `data-strategy`

1. Walk the whole journey in playwright-cli to map milestones.
2. ONE `@e2e` test for the journey (not one per step). Seed prerequisites via the `api`/helper fixtures.
3. Build/extend page objects per milestone; chain setup → actions → final assertion.
4. Run; flaky → `debugging`, then re-run 5×.

---

## Flow 4 — API suite for an endpoint group

**Skill:** `api-testing` → `type-safety`, `data-strategy`, `enums`, `security-testing`

1. **Phase 1 gate — should this be Playwright at all?** Large pure-API suite + non-TS backend → recommend backend-native tool and stop.
2. Source the contract from OpenAPI/Swagger (no docs → capture live shape and flag it).
3. Build the coverage plan: every endpoint × method × status code. Present before coding.
4. One `z.strictObject` schema per response; export schema + inferred type.
5. Paths → `enums/`; URLs/tokens → `process.env`. Happy-path payloads → Faker; invalid → static tiers.
6. Write tests with the `api` fixture; one describe per method+path; validate every body with `{ schema }`.
7. Cover the status matrix (200/201, 400/422, 401, 403, 404, 409, 204). Per-field negative coverage.
8. Behavior ≠ spec → `test.skip` + `// FIXME: <ticket>`; never loosen the schema.
9. Tag every test `@api`. Run `--project=api`.

---

## Flow 5 — Security / input fuzzing

**Skill:** `security-testing` → `api-testing`, `data-strategy`

1. Identify every field/param that accepts input.
2. Loop each over the malicious tiers (`SECURITY_PAYLOADS`, `INVALID_*` in `test-data/static/util/`).
3. Assert: rejected with 4xx (not 5xx — a 500 means it reached an unguarded path), and never reflected/executed/leaking a stack trace.
4. Tag `@security`. Run `npm run test:security`.

---

## Flow 6 — Debug a failing / flaky test

**Skill:** `debugging` → `wait-strategy`, `selectors`, `fixtures`

1. Read the full error (type, expected vs received, failing line).
2. Classify the mode (timeout / ZodError / strict-mode / locator-not-found / fixture-undefined / passes-alone-fails-in-suite).
3. Reproduce locally with the single spec.
4. Investigate with the right tool (trace viewer, UI mode, re-explore).
5. Fix at the **root cause** — no timeout bumps, no try/catch on expect, no silent skip.
6. Re-run; flake fixes get 5 consecutive green runs.

---

## Anti-Drift Guardrails (the rules most often skipped under pressure)

| Drift                                      | The rule that catches it                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Guessing a selector / URL / message        | Explore first or ASK. Never invent.                                                       |
| Proposing while unsure                     | Confidence < 5 → ASK, don't propose.                                                      |
| `waitForTimeout`                           | Banned (ESLint error) — deterministic waits only.                                         |
| `networkidle` on an SPA                    | Discouraged (ESLint warns); fine only on static/SSR pages that go quiet. `wait-strategy`. |
| Loosening a schema to pass                 | `test.skip` + `// FIXME`. Drift is a bug, not a fix.                                      |
| `z.object` for API                         | `z.strictObject` always.                                                                  |
| Empty-body-only 400 test                   | Per-field omission + per-field invalid-type loops.                                        |
| Asserting inside a page object             | Page objects act; specs assert.                                                           |
| `new SomePage(page)` in a test             | Use the fixture.                                                                          |
| Marking done with red tests                | Run the affected file; green before "done".                                               |
| Writing a big pure-API suite in Playwright | Phase-1 gate → recommend backend-native tool.                                             |
