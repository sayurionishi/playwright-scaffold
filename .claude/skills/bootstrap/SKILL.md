---
name: bootstrap
description: Use as the FIRST thing on a fresh clone (when PROJECT.md does not exist). Interviews the user about the target app, applies a profile (generic/controlled/salesforce/api-only), adds the opt-in overlays the target needs, and writes PROJECT.md.
---

# Bootstrap — Day 0

Turns the generic scaffold into one tailored to a specific target. Run this once per new project,
before writing any tests. If `PROJECT.md` already exists, do NOT run this — read it instead.

## Phase 1 — Interview (ask, don't guess)

Ask the user (batch the questions):

1. **What are we testing?** UI, API, or both?
2. **App type?** generic web app / an app we control the source of / Salesforce (or other heavy SPA).
3. **Auth?** Is there a login? Credentials/SSO? Or no auth (e.g. a local app)?
4. **API contract?** Is there an OpenAPI/Swagger spec? Where?
5. **Base URL(s)** for the first environment.

## Phase 2 — The API-only gate (be honest)

If the answer is "API only" AND the API is the primary SUT (not setup for a UI suite) →
**send the user to `sayurionishi/api-testing-scaffold` and stop.** That is the companion repo for
exactly this case: same methodology, a Python track (pytest + httpx + Pydantic v2) and a TypeScript
track (Vitest + Zod), no browser tooling. Other options if neither fits: RestAssured,
Schemathesis/Dredd. Don't scaffold browser projects for a backend suite.
(`profiles/api-only.md`, CLAUDE.md §5, `api-testing` P1.)

If the API calls only exist to **seed/clean state for UI tests**, that is not api-only — stay here
and use the `api` project. The two repos draw the line in exactly that place.

## Phase 3 — Select the profile

Map app type → profile (see `profiles/*.md`): `generic` | `controlled` | `salesforce` | `api-only`.
Read the chosen profile file; it specifies locator priority, wait notes, and auth handling.

### The Salesforce pack is an OPT-IN OVERLAY — and removing it is the user's call

**If the profile is NOT `salesforce`, ASK whether to remove the pack. Do not decide either way.**

> This target is not Salesforce. The pack is about half the repo and costs roughly 1,700
> always-loaded tokens per session — 9 of the 24 skills describe a platform you are not testing,
> which is a mis-trigger risk as well as wasted budget. Remove it? (recommended)
>
> `npm run prune:salesforce` — dry run first, then `-- --yes`. It lands as one revertable commit
> and verifies itself; if any gate fails it says so instead of claiming success.

Then **record the answer in `PROJECT.md`** (`Salesforce pack: removed` / `kept — <reason>`) so a
later session does not re-offer it, and so a team that kept it knows the pack is present on purpose.

**Either answer leaves a correct scaffold.** That is the point, and it is what makes the offer safe
to make at all — the pack is inert unless an org is configured:

- `playwright.config.ts` only declares the `org`, `setup:salesforce` and `salesforce` projects when
  `SF_LOGIN_URL` is set. Unset, they do not exist — `npm test` never reaches them.
- The Salesforce fixtures stay merged in `fixtures/test-options.ts` and cost nothing: Playwright
  fixtures are **lazy**, so one that no test destructures never runs. `salesforceConfig` reads every
  variable through a getter, so no `SF_*` var is ever required.
- The `salesforce*` skills load only on demand, and their descriptions carry a profile guard.

⚠️ **Never prune by hand, and never from a checklist.** This skill used to carry a prose prune
list, and following it BROKE THE BUILD: it omitted `fixtures/test-options.ts` — the one file
outside `*/salesforce/` that imports the Salesforce fixtures — so deleting `fixtures/salesforce/`
produced an unresolved-module error in **every spec**. A hand-maintained list of cross-cutting
edits always drifts from the code.

`scripts/prune-salesforce.ts` exists because of that failure. It validates every anchor before
writing anything (so a stale anchor changes nothing rather than half-applying), and it ends by
running typecheck, lint, format, the guard and rule-surface checks, and test discovery — so
"pruned" means "provably still green". If you find yourself deleting Salesforce files by hand,
stop: fix the script's anchors instead.

### Two tiers, so nobody pays for what they do not use

| The target is…                      | Add                                                          |
| ----------------------------------- | ------------------------------------------------------------ |
| not Salesforce                      | nothing — core only                                          |
| Salesforce, not FSC                 | tier 2: set `SF_LOGIN_URL`; the 8 `salesforce*` skills apply |
| Salesforce Financial Services Cloud | tier 2 **plus** `salesforce-fsc`                             |

Tier 3 is one extra question in Phase 3b, not a guess. Ask: **"Is this Financial Services Cloud?"**
FSC ships the `FinServ__` managed package, householding and reciprocal roles; if the answer is no,
`salesforce-fsc` is noise and should not be routed to. Record the answer in `PROJECT.md`.

**If the profile IS `salesforce`, go to Phase 3b instead of Phase 4.**

## Phase 3b — Salesforce bootstrap (only for the `salesforce` profile)

Load the `salesforce` skill, then work through these in order. Ask; don't guess — every item here is org
state you cannot read from a repo.

1. **Org access.** Which org(s) (scratch / Dev / Partial / Full sandbox / prod)? Recommend a scratch org
   per CI run if the team can adopt it. Never bootstrap against production. **Testing more than one
   environment** (e.g. dev + staging)? Copy the `env/.env.salesforce.example` block into EACH
   `env/.env.<environment>` file — storage state and the generated snapshot are already namespaced by
   `ENVIRONMENT` with nothing extra to do; see `docs/salesforce/TEST-ARCHITECTURE.md` §"Multi-environment"
   for what ISN'T automatic (the hand-authored contract/personas assume one environment's model).
2. **Auth strategy** (`salesforce-auth`). `jwt` for CI needs a Connected App — that's a human-with-Setup
   task; hand them the 5 steps from the skill and confirm step 4 (app assigned to the test users'
   profile/permset) is done. `sfdx` is fine locally.
3. **Financial Services Cloud?** Ask explicitly. If yes, route to `salesforce-fsc` for the
   `FinServ__` data model, householding roll-ups and reciprocal roles, and record `fsc: true` in
   `PROJECT.md`. If no, do not load it — it is a second-tier overlay and irrelevant elsewhere.
   Person Accounts are NOT an FSC question: any B2C org can have them enabled, and they live in
   `salesforce-data`. Ask whether the org uses them regardless of the FSC answer.
4. **Personas.** Which users/profiles/permission sets matter? Write them into
   `test-data/salesforce/personas.ts` and add one `SF_USERNAME_<KEY>` env var per persona. You do
   NOT need all of them to start: `setup:salesforce` skips any persona whose username is unset and
   prints a summary, so you can add them incrementally.
5. **Objects in scope.** Which sObjects will the suite touch? Then **run the generator**:
   `npm run sf:schemas -- Account Contact Opportunity` — this is what makes rule #15 satisfiable.
   Commit the generated schemas; they are the drift snapshot.
6. **API version.** Pin `SF_API_VERSION` and run the contract spec to confirm the org supports it.
7. **Verify the assumptions.** Walk `docs/salesforce/VERIFY-BEFORE-FIRST-RUN.md` with the user. It lists
   every org-dependent thing the pack assumes (session injection mechanism, IP locking, which screens use
   `ui-api` vs `/aura`, whether Duplicate Rules are on). Do NOT skip this — the pack ships patterns that
   are correct in general and need confirming per org.
8. **Declare the org shape.** Populate `test-data/salesforce/contracts/org-shape.ts` with the
   record types and picklist values the suite depends on, then run `npm run test:contract`. This is
   the programmatic half of step 7 — a sandbox refresh wipes hand-made config, and without this
   pre-flight that surfaces as dozens of locator-shaped UI failures instead of one clear message.
9. Then continue with Phase 4 (env, enums, example files) and Phase 5.

## Phase 4 — Apply the profile (propose the diff first, then edit on approval)

- **Selector priority:** the active profile is recorded in `PROJECT.md`; the `selectors` skill reads it. (No code change needed unless flipping example locators in `pages/login.page.ts`.)
- **Projects:** most of this is now automatic — check before editing.
  - **no auth** → nothing to do. The `setup` project only exists when `TEST_USER_EMAIL` is set, and
    the UI projects derive their `dependencies` and `storageState` from the same flag. Leave
    `helpers/auth/auth.setup.ts` in place; it is never collected without the variable.
  - **not Salesforce** → nothing to do (see Phase 3).
  - **api-only** → nothing to do, and **do not hand-delete the UI layer** — `fixtures/test-options.ts`
    imports the POM fixture, so deleting `fixtures/pom/` breaks every spec. `functional`/`e2e`
    collect zero tests once the example specs are gone, and `setup` only exists when
    `TEST_USER_EMAIL` is set. If the API is the SUT, you should be in
    `sayurionishi/api-testing-scaffold` (Phase 2), not pruning this one.
  - **UI-only** → keep `api`; it is how UI tests arrange state quickly.
- **Env:** create `env/.env.<env>` from the example; fill `BASE_URL`/`API_URL`/creds. **`BASE_URL` is the app ROOT** (e.g. `https://demo.playwright.dev`) — do NOT bake a path segment into it (e.g. `.../todomvc`), or a `goto('/')` will drop the path. Put path segments in `enums/util/routes.ts` and navigate to them.
- **Enums/config:** replace the example endpoints/routes/messages with the target's real ones (verify live / against OpenAPI — don't guess).
- **Example files — ASK the user, don't decide silently:** the scaffold ships example page objects + specs. Ask whether to **(a) delete** them or **(b) keep them as reference**. If kept, the example **specs** (`tests/**/*.spec.ts` — `login`, `users`, `users.security`, `user-journey`) MUST be moved out of `tests/` (e.g. to an `examples/` folder) — they target a fake app and **will run and FAIL** if left in a test project. Example page objects/components are harmless to keep.

  ⚠️ If you move the specs to `examples/`, add `examples/**` to the `ignores` list in
  `eslint.config.mjs`. The Playwright lint rules are scoped to the spec glob, so a moved example
  silently loses every Constitution check while still being the file people copy from — the golden
  reference would be the least-checked code in the repo.

## Phase 5 — Write PROJECT.md

Copy `PROJECT.md.template` → `PROJECT.md` and fill in: profile, what's tested, auth model, locator
priority, API-contract source, base URLs, and any target-specific facts discovered (framework, known
flaky areas, iframe/shadow-DOM notes for Salesforce). This file overrides the generic defaults for all
future tasks.

## Phase 6 — Hand off

Point the user at the first real task (usually a page object via `page-objects`, or an API suite via
`api-testing`). From here, normal audit-then-edit applies.

## Don't

- Don't generate tests before `PROJECT.md` exists.
- Don't silently delete OR silently keep the example files — **ask** (see Phase 4). If the user keeps them, move the example specs out of `tests/` so they don't run and fail against the real app.
- Don't pick a profile for the user silently — confirm the app type first.
- Don't prune the Salesforce pack. It is inert without `SF_LOGIN_URL`, and the old prune list broke
  every spec by missing `fixtures/test-options.ts`.
- Don't load `salesforce-fsc` unless the user confirmed Financial Services Cloud.
