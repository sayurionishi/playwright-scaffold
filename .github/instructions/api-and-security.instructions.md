---
applyTo: 'tests/api/**,fixtures/api/**,test-data/**'
---

# API & security testing (mirror of `.claude/skills/api-testing` + `security-testing` + `type-safety`)

<!-- BEGIN GENERATED: rules — edit rules/constitution.ts, run npm run rules:generate -->

- **Rule #5** — `any` type. A real type or `unknown` + narrowing (`type-safety`)
- **Rule #6** — `z.object(...)` for an API schema. `z.strictObject(...)` (catches contract drift)
- **Rule #7** — Skipping `expect(Schema.parse(body))` / `{ schema }` on an API response. Validate every response body

<!-- END GENERATED: rules -->

- **Tool gate first:** if the API itself is the SUT, use the companion repo **`sayurionishi/api-testing-scaffold`** (Python: pytest+httpx+Pydantic v2; TypeScript: Vitest+Zod) and stop — don't write it in Playwright. Other options: RestAssured, Schemathesis. API calls that only seed/clean state for UI tests are NOT this case: stay here.
- Source the contract from **OpenAPI/Swagger**; no docs → capture the live shape and flag it.
- **One `z.strictObject` schema per response** (never `z.object`); export schema + `z.output` type. Validate every body: `api.get(path, { schema })` or `expect(Schema.parse(body)).toBeTruthy()`.
- Paths from `enums/` via `buildPath`; URLs/tokens from `process.env`. Never hardcode.
- Happy-path payloads from Faker factories; invalid inputs from `test-data/static/util/invalid-values.ts`.
- **Cover the status matrix:** 200/201, 400/422, 401, 403, 404, 409, 204 + every code the spec lists. Per-field negative coverage, not just empty-body-400.
- Behavior ≠ spec → `test.skip` + `// FIXME: <ticket>`. Never loosen a schema to pass.
- **Security:** fuzz every field/param with `SECURITY_PAYLOADS` + `INVALID_*`. Assert 4xx (a 5xx is a finding), never reflected/executed, no stack-trace leak. Tag `@security`.
- One tag per test (`@api` or `@security`).
