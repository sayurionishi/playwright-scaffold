---
applyTo: 'tests/api/**,fixtures/api/**'
---

# API & security testing (mirror of `.claude/skills/api-testing` + `security-testing` + `type-safety`)

- **Tool gate first:** a large pure-API suite where the API is the SUT and the backend is non-TS → recommend pytest+Pydantic / RestAssured / Schemathesis instead, and stop. Don't write it in Playwright.
- Source the contract from **OpenAPI/Swagger**; no docs → capture the live shape and flag it.
- **One `z.strictObject` schema per response** (never `z.object`); export schema + `z.output` type. Validate every body: `api.get(path, { schema })` or `expect(Schema.parse(body)).toBeTruthy()`.
- Paths from `enums/` via `buildPath`; URLs/tokens from `process.env`. Never hardcode.
- Happy-path payloads from Faker factories; invalid inputs from `test-data/static/util/invalid-values.ts`.
- **Cover the status matrix:** 200/201, 400/422, 401, 403, 404, 409, 204 + every code the spec lists. Per-field negative coverage, not just empty-body-400.
- Behavior ≠ spec → `test.skip` + `// FIXME: <ticket>`. Never loosen a schema to pass.
- **Security:** fuzz every field/param with `SECURITY_PAYLOADS` + `INVALID_*`. Assert 4xx (a 5xx is a finding), never reflected/executed, no stack-trace leak. Tag `@security`.
- One tag per test (`@api` or `@security`).
