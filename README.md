# Playwright Scaffold — AI-Native Test Automation

A production-ready Playwright + TypeScript scaffold designed for **AI-assisted test development**.
Clone it, run the bootstrap, point it at your app, and your AI assistant generates page objects,
tests, and schemas that follow the framework's conventions automatically.

It fuses five battle-tested internal testing guides into one substrate:

- **Deterministic wait strategy + flake pitfalls** (SQA guide) — zero `waitForTimeout`, pre-registered response waits, `networkidle` only where a page truly goes quiet, blur-after-fill, the CSS-module loader trap.
- **Testing pyramid + API taxonomy + security** (playground guide) — success / format-error / functional-error, fuzzing.
- **AI skills architecture** (idavidov scaffold) — orchestrator + skills, confidence gate, audit-then-edit.
- **API-vs-UI strategy** (live-navigator guide) — API for setup, UI for validation.
- **Pure-API contract testing** (flowcell_server guide) — informs _when not to use Playwright for API_.

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
npm install
npx playwright install --with-deps

# 1. Configure for your app — in Claude Code, run the bootstrap skill:
#    it interviews you, picks a profile, prunes what you don't need, writes PROJECT.md.
#    (Until then the example files use the `generic` profile.)

# 2. Set up your environment file
cp env/.env.dev.example env/.env.dev   # then fill in BASE_URL / API_URL / creds

# 3. Run
npm run test:api          # backend suite (no browser)
npm run test:functional   # UI feature tests
npm run test:e2e          # full journeys
npm test                  # everything except @destructive
```

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
