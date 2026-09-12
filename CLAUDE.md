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
salesforce / api-only), activates the overlays the target needs, and writes `PROJECT.md`. Do not generate tests
against an unconfigured scaffold.

If `PROJECT.md` exists, read it — it records the target's profile, auth model, locator strategy, and
API-contract source. Those decisions override the generic defaults below.

If the recorded profile is **`salesforce`**, also load the `salesforce` skill before doing anything
else Salesforce-specific — the pack (§7) replaces several generic defaults outright.

---

## 1. The Constitution (hard stops — these are REFUSALS, not warnings)

Never ship, and refuse to generate, any of the following:

<!-- BEGIN GENERATED: constitution — edit rules/constitution.ts, run npm run rules:generate -->

| #   | Forbidden                                                                     | Instead                                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `page.waitForTimeout(...)`                                                    | Web-first assertion or a pre-registered response wait (`wait-strategy`)                                                                                                                                                                                               |
| 2   | `page.waitForLoadState('networkidle')` **on an SPA**                          | The specific gating response (`helpers/util/network.ts`). Acceptable ONLY on static/SSR pages that truly go quiet — never on a chatty SPA. **On the `salesforce` profile this is a hard REFUSAL, not a discouragement** (Aura never goes quiet). See `wait-strategy`. |
| 3   | XPath, CSS-class, nth-child, or auto-generated-id selectors                   | Semantic / testId per the active profile (`selectors`)                                                                                                                                                                                                                |
| 4   | A guessed selector, URL, enum value, endpoint, or UI string                   | **Explore first** (playwright-cli / OpenAPI) or **ASK**. Never invent.                                                                                                                                                                                                |
| 5   | `any` type                                                                    | A real type or `unknown` + narrowing (`type-safety`)                                                                                                                                                                                                                  |
| 6   | `z.object(...)` for an API schema                                             | `z.strictObject(...)` (catches contract drift)                                                                                                                                                                                                                        |
| 7   | Skipping `expect(Schema.parse(body))` / `{ schema }` on an API response       | Validate every response body                                                                                                                                                                                                                                          |
| 8   | Assertions inside a page object                                               | Page objects act; specs assert                                                                                                                                                                                                                                        |
| 9   | Raw locators in a spec                                                        | Locators live in page objects only                                                                                                                                                                                                                                    |
| 10  | `new SomePage(page)` inside a test                                            | Consume via the fixture (`async ({ somePage }) => …`)                                                                                                                                                                                                                 |
| 11  | Hardcoded URL / credential                                                    | `process.env.*` via `config/`; paths & messages via `enums/`                                                                                                                                                                                                          |
| 12  | `.json` static data                                                           | `.ts` with `as const`                                                                                                                                                                                                                                                 |
| 13  | Silencing a failure (`try/catch` on `expect`, raised timeout, silent `.skip`) | Fix the root cause; `test.skip` requires `// FIXME: <ticket>`                                                                                                                                                                                                         |
| 14  | More than one tag per test                                                    | Exactly one (`@smoke`/`@sanity`/`@regression`/`@api`/`@e2e`/`@security`/`@contract`/`@persona`); `@destructive` wins                                                                                                                                                  |
| 15  | A Salesforce object or field API name written from memory                     | Read it from `describe` / `ui-api/object-info` (`salesforce-metadata-contract`)                                                                                                                                                                                       |

<!-- END GENERATED: constitution -->

**What is actually enforced:**

<!-- BEGIN GENERATED: enforcement — edit rules/constitution.ts, run npm run rules:generate -->

Today **13 of the 15 rules are mechanically blocking**: a violation
fails `npm run lint` or `npm run guard`, and so fails the CI `quality` job. The remaining
2 (#4 and #15) are review-only — the honest answer, not a gap. They ask whether a value
was invented or read from a real source, and no linter can see that.

Per-rule detail — including the one rule enforced more narrowly than it is declared — is in
**`docs/PARITY-MATRIX.md`**. Both that file and this paragraph are generated from
`rules/constitution.ts`, so neither can overclaim: to make either say a rule is blocking, you
have to make the rule blocking.

<!-- END GENERATED: enforcement -->

This paragraph is generated because the hand-written version of it rotted: it claimed "2 of the 15"
long after enforcement had reached 13, and before that it claimed "a hook (ESLint) enforces #1, #2,
#5" — wrong in all three ways. Nothing caught either, because prose has no test.

There is no Claude Code hook in this repo. The blocking gate is the CI `quality` job
(`typecheck` + `lint` + `rules:check`); `.husky/pre-commit` runs `lint-staged` over staged files.

⚠️ The rule table above is generated. **Maintaining this layer has its own rules** —
`docs/MAINTAINING-THE-AI-LAYER.md` (what to encode, how to write a skill description, why a false
enforcement claim is worse than none). To change a rule, edit `rules/constitution.ts` and run
`npm run rules:generate` — that rewrites this table, the Copilot instructions, `AGENTS.md`, and the
parity matrix together, so Claude and Copilot cannot drift apart. `npm run rules:check` fails CI if
a generated block was hand-edited.

Rule #15 is the Salesforce-specific sharpening of #4, and it earns its own row because Salesforce field
API names are **org state, not application source**. An admin can add, rename, or delete a field with no
deploy and no commit, so there is no repository to read them from — `describe` is the only source of
truth. `Margin__c` existing in someone else's org proves nothing about yours.

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

### Salesforce (only when `PROJECT.md` profile is `salesforce`)

These override the generic skills above for anything Salesforce-specific. `salesforce` is the hub —
load it first if you're unsure which sibling applies.

| You want to…                                        | Skill                          | Chains to                             |
| --------------------------------------------------- | ------------------------------ | ------------------------------------- |
| Understand what to test (and NOT test) in an org    | `salesforce`                   | all of the below                      |
| Authenticate to an org / get past MFA / SSO         | `salesforce-auth`              | `config`, `salesforce-personas`       |
| Locate a Lightning element; fix a strict-mode clash | `salesforce-locators`          | `selectors`, `page-objects`           |
| Make a Lightning test wait reliably                 | `salesforce-waits`             | `wait-strategy`, `debugging`          |
| Test who can see/do what (profiles, permsets, FLS)  | `salesforce-personas`          | `salesforce-auth`, `test-standards`   |
| Guard against admin-made metadata drift             | `salesforce-metadata-contract` | `type-safety`, `api-testing`          |
| Create/clean up org records for a test              | `salesforce-data`              | `data-strategy`, `fixtures`           |
| Fix a test asserting too soon after a create/save   | `salesforce-async`             | `wait-strategy`, `salesforce-data`    |
| Test Financial Services Cloud specifically          | `salesforce-fsc`               | `salesforce-data`, `salesforce-async` |

If nothing matches, default to `common-tasks` or ASK. Naming a skill is a fallback for when the
wrong one loaded.

---

## 5. When NOT to use this scaffold (be honest)

- **The API itself is the system under test** → use the companion scaffold
  **`sayurionishi/api-testing-scaffold`**, which is built for exactly this and ships a Python track
  (pytest + httpx + Pydantic v2) and a TypeScript track (Vitest + Zod). Same methodology, no browser
  tooling. Other options: RestAssured (Java), or Schemathesis/Dredd for contract testing from
  OpenAPI. See `profiles/api-only.md` and `api-testing` Phase 1.
- **Load / performance testing** → k6 or Gatling, not this.
- This scaffold's API project is for **API-as-setup** and **same-stack, modest API-as-SUT** suites
  that benefit from sharing types/fixtures with the UI tests.

---

## 6. Profiles (set by `bootstrap`, recorded in `PROJECT.md`)

| Profile      | Locator priority                           | Notes                                   |
| ------------ | ------------------------------------------ | --------------------------------------- |
| `generic`    | role → label → placeholder → text → testId | Playwright-official order; default      |
| `controlled` | **testId** → role → label → text           | You can add `data-testid`; most stable  |
| `salesforce` | role → label → text → testId               | Full pack: extra skills + code. See §7. |
| `api-only`   | n/a                                        | UI projects collect nothing; see §5     |

The `selectors` and `wait-strategy` skills read the active profile from `PROJECT.md`.

---

## 7. The Salesforce pack (opt-in overlay)

Set `SF_LOGIN_URL` and the pack activates: `playwright.config.ts` declares the `org`,
`setup:salesforce` and `salesforce` projects, and the `salesforce*` skills apply. Leave it unset and
none of that exists — the fixtures stay merged and cost nothing, because Playwright fixtures are
lazy and `salesforceConfig` reads every variable through a getter. **Keeping the pack breaks
nothing**, which is what makes removing it a choice rather than a chore: run
`npm run prune -- --pack=salesforce` when you want the ~1,680 always-loaded tokens back. `bootstrap`
Phase 3 is required to offer it and forbidden to decide for you.

Code lives under `*/salesforce/` in each top-level directory (`config`, `enums`, `helpers`,
`fixtures`, `pages`, `test-data`, `tests`), plus `scripts/generate-*.ts`. `ls` is more current than
a list here.

Four things differ from every other profile, and they are the whole reason the pack exists. These
two identities are the ones to get right — everything else is recoverable:

1. **Two identities, not one.** `adminOrg` (System Admin) ARRANGES and TEARS DOWN; the subject
   persona ACTS and ASSERTS. Arrange as a restricted user → teardown silently cannot delete → data
   leaks. Assert as an admin → Modify All Data bypasses sharing and FLS → **the test passes with the
   permission model completely broken.** UI projects default to `standardUser`, never admin.
2. **Auth is org auth, not a login form.** The JWT bearer flow mints a session without touching the
   login UI — which is also how you legitimately get past mandatory MFA. Never automate an MFA
   challenge.
3. **The API contract is org metadata.** Salesforce ships no OpenAPI. `describe` _is_ the contract,
   and it changes the moment an admin clicks Save — so drift detection is a first-class test type
   (`@contract`).
4. **Every assertion has a "for whom".** The permission model is the product, and an absence
   assertion needs a positive control that is **not** an admin.

**Layering is not optional here.** The contract layer (`org`, no browser) asserts types, picklist
values, grants, CRUD and per-persona FLS; the UI layer (`salesforce`) asserts **behaviour only**.
Field metadata or a permission matrix in the UI is a wrong-layer error: ~100× the cost, and UI
absence is ambiguous (FLS? page layout? record type?) where the API tells you which.

The layer table, the persona lattice and the arrange/assert rule in full:
**`docs/salesforce/TEST-ARCHITECTURE.md`** and the `salesforce` skill. Financial Services Cloud adds
a second tier (`salesforce-fsc`), loaded only when `PROJECT.md` records it.
