# Playwright Scaffold — AI-Native Test Automation

A production-ready Playwright + TypeScript scaffold designed for **AI-assisted test development**.
Clone it, run the bootstrap, point it at your app, and your AI assistant generates page objects,
tests, and schemas that follow the framework's conventions automatically.

It distills hard-won lessons from real-world Playwright suites into one substrate:

- **Deterministic wait strategy + flake pitfalls** — zero `waitForTimeout`, pre-registered response waits, `networkidle` only where a page truly goes quiet, blur-after-fill, the CSS-module loader trap.
- **Testing pyramid + API taxonomy + security** — success / format-error / functional-error, input fuzzing.
- **AI skills architecture** — orchestrator + skills, confidence gate, audit-then-edit conversation contract.
- **API-vs-UI strategy** — API for fast setup, UI for validation; API/UI/E2E as separate projects.
- **Honest API tooling** — guidance on _when not to use Playwright for API testing_.

---

## What makes it different

- **API / UI / E2E are separate Playwright _projects_, not just folders** — independent run lanes (`test:api` runs in seconds, no browser), shared types/fixtures.
- **A `bootstrap` step tailors the scaffold to your app** via a _profile_ (generic / controlled-source / Salesforce / api-only) — so it's not wrong-by-default for your target.
- **`networkidle` is discouraged, not banned** (ESLint warns) — harmful on chatty SPAs (Salesforce especially), but legitimately fine on static/SSR pages that go quiet. Default to deterministic response waits.
- **Every API response is runtime-validated** with `z.strictObject` — contract drift fails the test.
- **The AI rules live in the repo** (`CLAUDE.md` + `.claude/skills/`), so generated code stays consistent.

---

## Quick start

```bash
# 1. Clone and install
git clone <your-fork-url> && cd playwright-scaffold
npm install
npx playwright install --with-deps

# 2. Configure your environment file
cp env/.env.dev.example env/.env.dev   # then fill in BASE_URL / API_URL / creds

# 3. Bootstrap — tailor the scaffold to YOUR app (see the walkthrough below)
#    Open the repo in Claude Code and run the bootstrap. It interviews you, picks a
#    profile, prunes what you don't need, and writes PROJECT.md.

# 4. Run
npm run test:api          # backend suite (no browser)
npm run test:functional   # UI feature tests
npm run test:e2e          # full journeys
npm test                  # everything except @destructive
```

### Step 3 in detail — using the bootstrap

The **first thing** you do on a fresh clone is bootstrap. It's the literal Day-0 step, before writing
any tests. In Claude Code (with this repo open), just say:

```
Bootstrap this scaffold for my app.
```

Claude loads the `bootstrap` skill and **interviews you** (~5 questions). A real run looks like:

```
You:    Bootstrap this scaffold for my app.

Claude: A few questions before I configure anything:
        1. What are we testing — UI, API, or both?
        2. App type — generic web app, an app you control the source of, or Salesforce / heavy SPA?
        3. Is there a login? (username+password / SSO / none)
        4. Is there an OpenAPI/Swagger spec for the API? Where?
        5. What's the base URL for your first environment?

You:    Both UI and API. It's a React app we own the source of. Username+password login.
        OpenAPI at https://app.test/openapi.json. Base URL https://app.test.

Claude: Proposal (confidence 9/10):
        - Profile: `controlled` (you can add data-testid) → testId-first locators
        - Keep all projects: api, setup, functional, e2e
        - Keep auth.setup.ts (username+password)
        - Set BASE_URL/API_URL in env/.env.dev
        - Replace example endpoints/routes with yours from the OpenAPI spec
        - Write PROJECT.md recording all of the above
        Approve?

You:    Approve.

Claude: Done. Wrote PROJECT.md (profile: controlled), kept 4 projects, wired auth.
        Next: want a page object for your login screen, or the first API suite?
```

After bootstrap, `PROJECT.md` exists and records your profile, auth model, locator priority, and
API-contract source — every later task reads it. Then you just describe work in plain language
("add a page object for the settings page", "add API tests for `POST /orders`") and Claude routes to
the right skill, explores, proposes, and — on your approval — writes tests that follow the conventions.

> **No login app?** Say so in the interview — bootstrap removes the `setup` project and `auth.setup.ts`.
> **API-only?** It may recommend a backend-native tool instead (see "When NOT to use this" below).

### Scripts

| Command                                                          | Runs                              |
| ---------------------------------------------------------------- | --------------------------------- |
| `npm run test:api`                                               | the `api` project (backend = SUT) |
| `npm run test:functional` / `:e2e`                               | UI projects                       |
| `npm run test:smoke` / `:sanity` / `:regression`                 | by tag                            |
| `npm run test:security`                                          | `@security` fuzzing subset        |
| `npm run test:ui` / `:debug` / `:headed`                         | interactive debugging             |
| `npm run test:ci`                                                | replay CI conditions locally      |
| `npm run lint` / `:fix` · `npm run format` · `npm run typecheck` | quality gates                     |

---

## Layout

```
CLAUDE.md           Constitution (hard rules) + skills index — always loaded by the AI
AI-WORKFLOWS.md     Step-by-step playbook (the map)
.claude/skills/     14 skills: wait-strategy, selectors, page-objects, api-testing, security-testing,
                    type-safety, data-strategy, fixtures, enums, config, test-standards, debugging,
                    common-tasks, ai-native-workflow  (+ bootstrap)
config/  enums/  env/
helpers/            util/network.ts (deterministic waits), util/forms.ts, auth/auth.setup.ts
pages/              base.page.ts + *.page.ts + components/
test-data/          factories/ (Faker) + static/ (as const)
fixtures/           api/ (ApiRequest + Zod schemas) + pom/ + helper/ + test-options.ts (single import)
tests/              api/  functional/  e2e/
```

---

## When NOT to use this for API testing

Playwright's API mode is right for **API-as-setup** and **modest, same-stack API-as-SUT** suites that
share types with the UI tests. It is **overkill** for a large, pure-API suite — especially when the
API is the primary system under test and the backend is **not** TypeScript.

In that case prefer a backend-native tool: **pytest + httpx + Pydantic** (Python), **RestAssured**
(Java), **Vitest + Zod** (Node, no browser), or **Schemathesis / Dredd** (contract testing from
OpenAPI). The `bootstrap` skill's `api-only` path will tell you this too.

---

## Working with the AI

Describe the task in plain language. The AI loads the matching skill (`CLAUDE.md` routing), explores
the live app/contract, proposes scope with a confidence score, waits for your approval, applies, runs
the affected tests, and reports. You stay in the loop at the approval step. See `AI-WORKFLOWS.md`.

---

## Built on Playwright best practices

The conventions here align with the official Playwright docs — start there if a pattern is unfamiliar:

- [Best Practices](https://playwright.dev/docs/best-practices) — web-first assertions, test isolation, locators
- [Locators](https://playwright.dev/docs/locators) & [test-id](https://playwright.dev/docs/locators#locate-by-test-id) (configurable via `testIdAttribute`)
- [Fixtures](https://playwright.dev/docs/test-fixtures) · [Projects](https://playwright.dev/docs/test-projects) · [Auth](https://playwright.dev/docs/auth)
- [API testing](https://playwright.dev/docs/api-testing) · [Tagging](https://playwright.dev/docs/test-annotations#tag-tests) · [Soft assertions](https://playwright.dev/docs/test-assertions#soft-assertions)
- [CI](https://playwright.dev/docs/ci-intro) & [Sharding](https://playwright.dev/docs/test-sharding) — see `.github/workflows/playwright.yml`
- [Trace Viewer](https://playwright.dev/docs/trace-viewer) (`npm run report`) · [UI Mode](https://playwright.dev/docs/test-ui-mode) (`npm run test:ui`)
