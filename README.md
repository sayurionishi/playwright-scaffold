# Playwright Scaffold

AI assistants are remarkably good at writing Playwright tests — and remarkably inconsistent about
_how_ they write them. Left to their own interpretation, the same assistant produces a different
locator strategy, wait pattern, and assertion style from one task to the next.

This scaffold solves that by putting the conventions **in the repository itself** as machine-readable
rules. The hard lessons from real Playwright suites — the wait strategy that kills flake, the locator
hierarchy that survives a redesign, the clean API/UI seam, the security pass most teams skip —
are encoded once and enforced on every task, across every engineer, across every AI tool used on the
project. Clone it, bootstrap it for your app, and the assistant writes to your standard from the
first test.

---

## How it works

The rules ship as machine-readable instructions, layered smallest-to-largest blast radius. The same
conventions are authored once and provided to whichever assistant you use:

1. **Always-loaded constitution** — the hard rules (the ones that are refusals, not suggestions) plus
   a routing table that maps "what you want to do" to the right detailed instructions.
2. **On-demand rule sets** — the deep rules for one topic (locators, waits, schemas, …), pulled in
   only when the task touches that area, so context stays lean.
3. **The code itself** — the example page objects, fixtures, and specs are the reference
   implementation. When a rule and the code disagree, that's a bug to fix.

Both supported assistants read the same conventions from their native rule format:

| Assistant          | Constitution                      | On-demand rule sets                      |
| ------------------ | --------------------------------- | ---------------------------------------- |
| **Claude Code**    | `CLAUDE.md`                       | `.claude/skills/<name>/SKILL.md`         |
| **GitHub Copilot** | `.github/copilot-instructions.md` | `.github/instructions/*.instructions.md` |

The result: you describe work in plain language, the assistant explores the live app or API contract,
proposes a scoped change with a confidence score, waits for your **approval**, applies it, runs the
affected tests, and reports. You stay in the loop at the approval gate.

---

## Getting started

```bash
# 1. Clone and install
git clone <your-fork-url> && cd playwright-scaffold
npm install
npx playwright install --with-deps

# 2. Configure your environment
cp env/.env.dev.example env/.env.dev    # fill in BASE_URL / API_URL / creds

# 3. Bootstrap — tailor the scaffold to your app (see below)
# 4. Run
npm run test:api          # backend suite (no browser)
npm run test:functional   # UI feature tests
npm run test:e2e          # full journeys
npm test                  # everything except @destructive
```

**Step 3 in detail — bootstrap before writing a single test.** Open the repo in Claude Code and say:

```
Bootstrap this scaffold for my app.
```

It interviews you (~5 questions) and a real run looks like this:

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

Based on your answers, it picks a **profile** that tunes the defaults to your target, prunes what
you don't need, and writes `PROJECT.md`. Every later task reads that file, so the scaffold stops
being generic and starts being yours.

| Profile      | What it changes                                                                  |
| ------------ | -------------------------------------------------------------------------------- |
| `generic`    | Playwright's official locator order (role → label → text → testId). The default. |
| `controlled` | You can add `data-testid` → testId-first locators. Most stable.                  |
| `salesforce` | Lightning anti-flake rules; never trusts hashed ids/classes.                     |
| `api-only`   | Prunes the UI projects (and may suggest a backend-native tool instead).          |

After bootstrap, just describe work in plain language — _"add a page object for the settings page"_,
_"add API tests for `POST /orders`"_ — and the assistant routes, explores, proposes, and (on
approval) writes tests that follow the conventions.

> No login? Say so in the interview — bootstrap removes the `setup` project and `auth.setup.ts`.

---

## Running tests

| Command                                                 | Runs                                          |
| ------------------------------------------------------- | --------------------------------------------- |
| `npm run test:api`                                      | the `api` project (backend = SUT, no browser) |
| `npm run test:functional` / `:e2e`                      | UI projects                                   |
| `npm run test:smoke` / `:sanity` / `:regression`        | by tag                                        |
| `npm run test:security`                                 | the `@security` fuzzing subset                |
| `npm run test:ui` / `:debug` / `:headed`                | interactive debugging                         |
| `npm run test:ci`                                       | replay CI conditions locally                  |
| `npm run lint` · `npm run typecheck` · `npm run format` | quality gates                                 |
| `npm test`                                              | everything except `@destructive`              |

---

## Key design decisions (and why)

What separates this from a blank `npm init playwright`:

- **API, UI, and E2E are separate Playwright _projects_, not just folders.** Independent run lanes
  with shared types and fixtures — `test:api` finishes in seconds with no browser. The seam is _what
  is the system under test_, not which tool makes the call: API-as-setup is a fixture inside a UI
  test; API-as-SUT is the `api` project.
- **Deterministic waits, no sleeping.** `waitForTimeout` is banned outright; `networkidle` is
  discouraged (ESLint warns) because it's actively harmful on chatty SPAs — legitimately fine only on
  static pages that truly go quiet. Default to a pre-registered response wait.
- **Every API response is runtime-validated** with `z.strictObject`, so contract drift fails the test
  instead of silently passing.
- **Assertions live in specs, never in page objects.** Page objects act; specs assert; locators stay
  in page objects. One rule, no ambiguity about where a check belongs.
- **Tests are tagged exactly once** (`@smoke` / `@sanity` / `@regression` / `@api` / `@e2e` /
  `@security`), and `test.step` labels each beat — **AAA or Given/When/Then, your choice** (they're
  the same three-beat shape; the `test-standards` skill explains).
- **Honest about its own limits.** For a large, pure-API suite over a non-TypeScript backend, this
  recommends a backend-native tool instead of pretending Playwright is the answer (see below).

---

## Layout

```
CLAUDE.md           Hard rules (Constitution) + skill routing index — always loaded by the assistant
AI-WORKFLOWS.md     The step-by-step playbook (map)
.claude/skills/     On-demand rule sets: waits, selectors, page objects, api & security testing,
                    type safety, data strategy, fixtures, enums, config, test standards, debugging
config/  enums/  env/
helpers/            util/network.ts (deterministic waits), util/forms.ts, auth/auth.setup.ts
pages/              base.page.ts + *.page.ts + components/
test-data/          factories/ (Faker, dynamic) + static/ (as const, invalid/boundary)
fixtures/           api/ (ApiRequest + Zod schemas) + pom/ + helper/ + test-options.ts (one import)
tests/              api/   functional/   e2e/
```

---

## When _not_ to use this scaffold

Playwright's API mode is the right fit for **API-as-setup** and **modest, same-stack API-as-SUT**
suites that benefit from sharing types with the UI tests. It is **overkill** for a large, pure-API
suite — especially when the API is the primary system under test and the backend is **not** TypeScript.

In that case prefer a backend-native tool:

- **pytest + httpx + Pydantic** (Python)
- **RestAssured** (Java)
- **Vitest + Zod** (Node, no browser)
- **Schemathesis / Dredd** — contract testing straight from OpenAPI

The `bootstrap` skill's `api-only` path surfaces this guidance too. Load and performance testing
belongs in **k6** or **Gatling**, not here.

---

## Built on Playwright best practices

The conventions track the official Playwright guidance — start there if a pattern is unfamiliar:

- [Best Practices](https://playwright.dev/docs/best-practices) · [Locators](https://playwright.dev/docs/locators) & [test-id](https://playwright.dev/docs/locators#locate-by-test-id)
- [Fixtures](https://playwright.dev/docs/test-fixtures) · [Projects](https://playwright.dev/docs/test-projects) · [Auth](https://playwright.dev/docs/auth)
- [API testing](https://playwright.dev/docs/api-testing) · [Tagging](https://playwright.dev/docs/test-annotations#tag-tests) · [Soft assertions](https://playwright.dev/docs/test-assertions#soft-assertions)
- [CI](https://playwright.dev/docs/ci-intro) & [Sharding](https://playwright.dev/docs/test-sharding) (see `.github/workflows/playwright.yml`) · [Trace Viewer](https://playwright.dev/docs/trace-viewer) · [UI Mode](https://playwright.dev/docs/test-ui-mode)

---

## Acknowledgements

Built from hard-won practice across past Playwright projects, and informed by ideas circulating in
the wider Playwright and AI-assisted-testing community. Licensed under MIT — see `LICENSE`.
