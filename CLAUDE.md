# CLAUDE.md — Test Automation Scaffold Constitution

> **This file is always loaded.** It is the constitution (hard rules), the workflow, and the
> index of skills. The deep rules live in `.claude/skills/<name>/SKILL.md`; this file routes you
> there. When this file and a skill disagree, the **skill wins** — and that's a bug to fix here.

You are working in an **AI-native Playwright + TypeScript scaffold** that distills hard-won lessons
from real-world Playwright suites. It tests **UI (functional + e2e)** and **API**, with **security**
coverage, using the Page Object Model, fixture-based DI, deterministic waits, and runtime-validated schemas.

---

## 0. First contact — is this scaffold even configured?

If `PROJECT.md` does NOT exist in the repo root, this is a fresh clone. **Run the `bootstrap` skill
first** — it interviews the user about the target app, applies a profile (generic / controlled /
salesforce / api-only), prunes what isn't needed, and writes `PROJECT.md`. Do not generate tests
against an unconfigured scaffold.

If `PROJECT.md` exists, read it — it records the target's profile, auth model, locator strategy, and
API-contract source. Those decisions override the generic defaults below.

---

## 1. The Constitution (hard stops — these are REFUSALS, not warnings)

Never ship, and refuse to generate, any of the following:

| #   | Forbidden                                                                     | Instead                                                                                                                                                                    |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `page.waitForTimeout(...)`                                                    | Web-first assertion or a pre-registered response wait (`wait-strategy`)                                                                                                    |
| 2   | `page.waitForLoadState('networkidle')` **on an SPA**                          | The specific gating response (`helpers/util/network.ts`). Acceptable ONLY on static/SSR pages that truly go quiet — never on a chatty SPA/Salesforce. See `wait-strategy`. |
| 3   | XPath, CSS-class, nth-child, or auto-generated-id selectors                   | Semantic / testId per the active profile (`selectors`)                                                                                                                     |
| 4   | A guessed selector, URL, enum value, endpoint, or UI string                   | **Explore first** (playwright-cli / OpenAPI) or **ASK**. Never invent.                                                                                                     |
| 5   | `any` type                                                                    | A real type or `unknown` + narrowing (`type-safety`)                                                                                                                       |
| 6   | `z.object(...)` for an API schema                                             | `z.strictObject(...)` (catches contract drift)                                                                                                                             |
| 7   | Skipping `expect(Schema.parse(body))` / `{ schema }` on an API response       | Validate every response body                                                                                                                                               |
| 8   | Assertions inside a page object                                               | Page objects act; specs assert                                                                                                                                             |
| 9   | Raw locators in a spec                                                        | Locators live in page objects only                                                                                                                                         |
| 10  | `new SomePage(page)` inside a test                                            | Consume via the fixture (`async ({ somePage }) => …`)                                                                                                                      |
| 11  | Hardcoded URL / credential                                                    | `process.env.*` via `config/`; paths & messages via `enums/`                                                                                                               |
| 12  | `.json` static data                                                           | `.ts` with `as const`                                                                                                                                                      |
| 13  | Silencing a failure (`try/catch` on `expect`, raised timeout, silent `.skip`) | Fix the root cause; `test.skip` requires `// FIXME: <ticket>`                                                                                                              |
| 14  | More than one tag per test                                                    | Exactly one (`@smoke`/`@sanity`/`@regression`/`@api`/`@e2e`/`@security`); `@destructive` wins                                                                              |

A hook (ESLint) enforces #1, #2, #5. The rest are on you.

---

## 2. The conversation contract — audit-then-edit

Every non-trivial task runs the same loop:

1. **State** — the user states the goal in plain language.
2. **Route + explore** — load the matching skill (§4); gather evidence (playwright-cli / OpenAPI / `ls`). Missing a primary input → **ASK**, do not guess.
3. **Propose** — emit a scope block: what changes, in which files, why, trade-offs, and a **confidence 1–10**. Confidence < 5 means exploration is incomplete → do NOT propose; go back and ASK.
4. **Approve** — wait for the user. No code before approval (except trivial Direct-Mode fixes).
5. **Apply** — make the edits per the leaf skill; re-check every Constitution rule.
6. **Verify** — lint + run the affected tests (never the whole suite). Red → `debugging`.
7. **Report + commit** — list files changed; ask before committing.

**Direct Mode:** one-line fixes / typos may skip the proposal — but still verify the premise is real first. The user can opt into Direct Mode for a session by saying "just do it."

---

## 3. The architecture in one screen

```
config/        URLs + runtime settings (process.env). NEVER paths/messages.
enums/         endpoint PATHS, UI ROUTES, UI MESSAGES (as const). Verified, never guessed.
env/           .env.<environment> files (gitignored; *.example tracked).
helpers/       util/network.ts (deterministic waits), util/forms.ts, auth/auth.setup.ts
pages/         base.page.ts + *.page.ts + components/  (locators-on-top, actions only)
test-data/     factories/ (Faker, dynamic happy-path) + static/ (as const, invalid/boundary)
fixtures/      api/ (ApiRequest + Zod schemas) + pom/ + helper/ + test-options.ts (single import)
tests/         api/ (backend = SUT)  functional/ (one screen)  e2e/ (full journey)
```

**Projects, not just folders** (`playwright.config.ts`): `api` (no browser), `setup` (auth state),
`functional`, `e2e`. The SEAM is _what is the system under test_ — not which tool makes the call.
API-as-setup is a fixture inside UI tests; API-as-SUT is the `api` project.

**Every spec imports from one place:** `import { test, expect } from '<...>/fixtures/test-options';`

---

## 4. Routing — describe the work, the skill loads itself

| You want to…                                 | First skill          | Chains to                                                   |
| -------------------------------------------- | -------------------- | ----------------------------------------------------------- |
| Configure a fresh clone for an app           | `bootstrap`          | `selectors`, `config`, `api-testing`                        |
| Add a page object / new screen               | `page-objects`       | `selectors`, `fixtures`, `enums`                            |
| Pick or fix a locator                        | `selectors`          | `page-objects`                                              |
| Add a UI functional test                     | `test-standards`     | `page-objects`, `data-strategy`                             |
| Add an end-to-end journey                    | `test-standards`     | `page-objects`, `data-strategy`                             |
| Make a test pass/wait reliably; fix a flake  | `wait-strategy`      | `debugging`, `selectors`                                    |
| Add API tests for an endpoint                | `api-testing`        | `type-safety`, `data-strategy`, `enums`, `security-testing` |
| Add security / input-fuzzing tests           | `security-testing`   | `api-testing`, `data-strategy`                              |
| Write/refactor a Zod schema or kill an `any` | `type-safety`        | `api-testing`                                               |
| Create a factory / curated invalid data      | `data-strategy`      | `type-safety`                                               |
| Wire a fixture (page object / helper)        | `fixtures`           | `api-testing`                                               |
| Add an endpoint / route / message            | `enums`              | `selectors` (verify live text)                              |
| Add an env var / URL / credential            | `config`             | `enums`, `type-safety`                                      |
| Debug a failing / flaky test                 | `debugging`          | `wait-strategy`, `selectors`, `fixtures`                    |
| "How do I…" / "generate a prompt for…"       | `common-tasks`       | the matching skill                                          |
| Understand the whole way of working          | `ai-native-workflow` | —                                                           |

If nothing matches, default to `common-tasks` or ASK. Naming a skill is a fallback for when the
wrong one loaded.

---

## 5. When NOT to use this scaffold (be honest)

- **Large, pure API suite where the API is the SUT and the backend is non-TypeScript** → recommend a
  backend-native framework instead (pytest + Pydantic, RestAssured, or Schemathesis/Dredd for
  contract testing from OpenAPI). Playwright's API mode is overkill there. See `api-testing` Phase 1.
- **Load / performance testing** → k6 or Gatling, not this.
- This scaffold's API project is for **API-as-setup** and **same-stack, modest API-as-SUT** suites
  that benefit from sharing types/fixtures with the UI tests.

---

## 6. Profiles (set by `bootstrap`, recorded in `PROJECT.md`)

| Profile      | Locator priority                           | Notes                                                  |
| ------------ | ------------------------------------------ | ------------------------------------------------------ |
| `generic`    | role → label → placeholder → text → testId | Playwright-official order; default                     |
| `controlled` | **testId** → role → label → text           | You can add `data-testid`; most stable                 |
| `salesforce` | role → label → text → testId               | + Lightning anti-flake; never trust hashed ids/classes |
| `api-only`   | n/a                                        | UI projects pruned; reconsider §5 first                |

The `selectors` and `wait-strategy` skills read the active profile from `PROJECT.md`.
