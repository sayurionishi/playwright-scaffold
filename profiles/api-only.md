# Profile: api-only

For a backend-only test suite (no UI under test).

## First: is Playwright even the right tool? (decision gate)

**Recommend a backend-native framework instead — and stop — when ALL hold:**

- the API is the primary system under test (not setup for a UI suite), AND
- the suite is or will be large, AND
- the backend is **not** TypeScript (or is owned by a backend team).

Then point to: **pytest + httpx + Pydantic** (Python), **RestAssured** (Java),
**Vitest + Zod** (Node, no browser), or **Schemathesis / Dredd** (contract/property testing from OpenAPI).
Playwright carries browser tooling you won't use and trace-oriented reporting that's meaningless for API.

## If Playwright API testing is appropriate (small/medium, TS, same team)

- **Projects:** delete `setup`, `functional`, `e2e` from `playwright.config.ts`; keep only `api`.
- Delete `pages/`, `helpers/auth/`, the UI fixtures (`fixtures/pom/`), and UI example tests.
- Keep `fixtures/api/`, `fixtures/helper/`, `enums/util/api-endpoints.ts`, `test-data/`, `config/`.
- Everything else follows the `api-testing`, `type-safety`, `security-testing`, `data-strategy` skills.
