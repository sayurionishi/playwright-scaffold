# Profile: api-only

For a backend-only test suite (no UI under test).

## First: you are probably in the wrong repo

There is a companion scaffold built for exactly this case —
**[`sayurionishi/api-testing-scaffold`](https://github.com/sayurionishi/api-testing-scaffold)**:

> "A standalone scaffold for suites where **the API itself is what you're testing** — not browser
> automation, not API-as-setup-for-UI. Deliberately **not** Playwright."

It ships two tracks — **Python** (pytest + httpx + Pydantic v2) and **TypeScript** (Vitest + native
`fetch` + Zod) — with the same methodology as this repo: a `bootstrap` skill, a `PROJECT.md`, one
rule source, and Copilot instructions. It is not a vague pointer; it is this scaffold's approach,
correctly housed for a suite with no browser in it.

The two repos already agree from the other side — its README says: _"If your API tests only exist to
seed/clean state for UI tests, stop here — use the Playwright scaffold's `api` fixture instead."_

## The decision, in one table

| Your situation                                                  | Where to go                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| API calls exist to **seed/clean state for UI tests**            | **Stay here.** The `api` project and the `apiRequest` fixture are built for it.           |
| **The API itself is the system under test**                     | **`sayurionishi/api-testing-scaffold`.** Pick the Python or the TypeScript track.         |
| API is the SUT, but the suite is small and shares types with UI | Either works. Staying here buys shared Zod schemas and fixtures; that is the only reason. |

Other backend-native options, if neither track fits: **RestAssured** (Java), or
**Schemathesis / Dredd** for property/contract testing straight from OpenAPI.

## If you stay here anyway

**Do not hand-delete the UI layer.** A previous version of this file told you to delete `pages/`,
`helpers/auth/` and `fixtures/pom/` — following it produced an unresolved-module error in **every**
spec, because `fixtures/test-options.ts` imports `./pom/page-object-fixture` and the list never
mentioned it. There is nothing to delete:

- The `setup` project only exists when `TEST_USER_EMAIL` is set (`playwright.config.ts`), so on an
  api-only target it is never collected.
- `functional` and `e2e` collect **zero tests** once the example specs are gone, so they cost
  nothing at runtime and are invisible in `--list` output.
- Playwright fixtures are lazy: a page-object fixture no test destructures never runs.

So: delete the example specs (`bootstrap` Phase 4 already asks about this), leave the plumbing
alone, and follow the `api-testing`, `type-safety`, `security-testing` and `data-strategy` skills.
