---
name: bootstrap
description: Use as the FIRST thing on a fresh clone (when PROJECT.md does not exist). Interviews the user about the target app, applies a profile (generic/controlled/salesforce/api-only), prunes what isn't needed, and writes PROJECT.md.
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

If the answer is "API only", AND the suite will be large, AND the API is the primary SUT, AND the
backend is non-TypeScript → **recommend a backend-native tool instead** (pytest+Pydantic, RestAssured,
Schemathesis/Dredd) and stop. Don't scaffold browser projects for that. (CLAUDE.md §5, `api-testing` P1.)

## Phase 3 — Select the profile

Map app type → profile (see `profiles/*.md`): `generic` | `controlled` | `salesforce` | `api-only`.
Read the chosen profile file; it specifies locator priority, wait notes, and auth handling.

**If the profile is NOT `salesforce`, prune the Salesforce pack** — it's dead weight otherwise:
`.claude/skills/salesforce*/`, `config/salesforce.config.ts`, `enums/salesforce/`, `helpers/salesforce/`,
`fixtures/salesforce/`, `pages/salesforce/`, `test-data/salesforce/`, `tests/salesforce/`,
`scripts/generate-sobject-schemas.ts`, `docs/salesforce/`, the `org` + persona-setup projects in
`playwright.config.ts`, and the `sf:*` / `test:contract` / `test:personas` scripts in `package.json`.

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
3. **Personas.** Which users/profiles/permission sets matter? Write them into
   `test-data/salesforce/personas.ts` and add one `SF_USERNAME_<KEY>` env var per persona.
4. **Objects in scope.** Which sObjects will the suite touch? Then **run the generator**:
   `npm run sf:schemas -- Account Contact Opportunity` — this is what makes rule #15 satisfiable.
   Commit the generated schemas; they are the drift snapshot.
5. **API version.** Pin `SF_API_VERSION` and run the contract spec to confirm the org supports it.
6. **Verify the assumptions.** Walk `docs/salesforce/VERIFY-BEFORE-FIRST-RUN.md` with the user. It lists
   every org-dependent thing the pack assumes (session injection mechanism, IP locking, which screens use
   `ui-api` vs `/aura`, whether Duplicate Rules are on). Do NOT skip this — the pack ships patterns that
   are correct in general and need confirming per org.
7. Then continue with Phase 4 (env, enums, example files) and Phase 5.

## Phase 4 — Apply the profile (propose the diff first, then edit on approval)

- **Selector priority:** the active profile is recorded in `PROJECT.md`; the `selectors` skill reads it. (No code change needed unless flipping example locators in `pages/login.page.ts`.)
- **Projects:** in `playwright.config.ts`, remove projects the target doesn't use:
  - api-only → delete `setup`, `functional`, `e2e`; keep `api`.
  - UI-only → keep `setup`/`functional`/`e2e`; you may keep `api` for setup/teardown.
  - no auth → delete the `setup` project + its `dependencies`, and delete `helpers/auth/auth.setup.ts`, and drop `storageState` from UI projects.
- **Env:** create `env/.env.<env>` from the example; fill `BASE_URL`/`API_URL`/creds. **`BASE_URL` is the app ROOT** (e.g. `https://demo.playwright.dev`) — do NOT bake a path segment into it (e.g. `.../todomvc`), or a `goto('/')` will drop the path. Put path segments in `enums/util/routes.ts` and navigate to them.
- **Enums/config:** replace the example endpoints/routes/messages with the target's real ones (verify live / against OpenAPI — don't guess).
- **Example files — ASK the user, don't decide silently:** the scaffold ships example page objects + specs. Ask whether to **(a) delete** them or **(b) keep them as reference**. If kept, the example **specs** (`tests/**/*.spec.ts` — `login`, `users`, `users.security`, `user-journey`) MUST be moved out of `tests/` (e.g. to an `examples/` folder) — they target a fake app and **will run and FAIL** if left in a test project. Example page objects/components are harmless to keep.

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
