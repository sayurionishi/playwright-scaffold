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

## Phase 4 — Apply the profile (propose the diff first, then edit on approval)

- **Selector priority:** the active profile is recorded in `PROJECT.md`; the `selectors` skill reads it. (No code change needed unless flipping example locators in `pages/login.page.ts`.)
- **Projects:** in `playwright.config.ts`, remove projects the target doesn't use:
  - api-only → delete `setup`, `functional`, `e2e`; keep `api`.
  - UI-only → keep `setup`/`functional`/`e2e`; you may keep `api` for setup/teardown.
  - no auth → delete the `setup` project + its `dependencies`, and delete `helpers/auth/auth.setup.ts`, and drop `storageState` from UI projects.
- **Env:** create `env/.env.<env>` from the example; fill `BASE_URL`/`API_URL`/creds.
- **Enums/config:** replace the example endpoints/routes/messages with the target's real ones (verify live / against OpenAPI — don't guess).

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
- Don't keep example files (`login.page.ts`, `users.spec.ts`, etc.) as-is — they're references; replace or delete once real ones exist.
- Don't pick a profile for the user silently — confirm the app type first.
