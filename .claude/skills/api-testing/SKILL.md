---
name: api-testing
description: Use when adding API tests where the backend is the system under test — endpoint coverage, status matrix, schema validation. Phase 1 gates whether Playwright is even the right tool.
---

# API Testing (backend = system under test)

Runs in the `api` Playwright project (no browser). Tests use the `api` fixture (`ApiRequest`) and
validate every response against a Zod schema.

## Phase 1 — Should this even be Playwright? (decision gate)

Playwright's API mode is great for **API-as-setup** and **modest, same-stack API-as-SUT** suites that
share types/fixtures with the UI tests. It is **overkill** for a large pure-API suite — it carries
browser tooling you don't use and its reporting is trace-oriented.

**Recommend a backend-native tool instead, and stop, when ALL of these hold:**

- the API is the primary system under test (not just setup for UI), AND
- the suite is large / will grow large, AND
- the backend is **not** TypeScript (or is owned by a backend team).

Then point to: **pytest + httpx + Pydantic** (Python), **RestAssured** (Java), **Vitest + Zod**
(Node, no browser), or **Schemathesis / Dredd** (property/contract testing straight from OpenAPI).

Otherwise, proceed here.

## Phase 2 — Source the contract

OpenAPI / Swagger is the source of truth. No docs → capture the live shape as a fallback and **flag it**
in the proposal. Never invent fields.

> **Salesforce:** there is no OpenAPI. The contract is the org's own metadata (`sobjects/<Object>/describe`),
> it drifts without a deploy, and schemas are **generated, not hand-written**. Load
> **`salesforce-metadata-contract`** — it replaces this phase for org data access. Custom Apex REST
> endpoints are your own code, so the rest of this skill applies to them in full.

## Phase 3 — Schemas (see `type-safety`)

One `z.strictObject` per response; export schema + inferred type. Reuse `_error.schema.ts` for errors.

## Phase 4 — Write the tests

- One `test.describe` per method + path; tag every test `@api`.
- Validate every body: `const { data } = await api.post(path, { data, schema: UserSchema })` — `api`
  throws on drift. Or `expect(Schema.parse(body)).toBeTruthy()`.
- Paths from `enums/` via `buildPath`; URLs/tokens from `process.env`. Never hardcode.
- Happy-path payloads from Faker factories; invalid inputs from static tiers (`data-strategy`).
- Shared setup reused in 3+ files → promote to a helper fixture (`fixtures`); else use `api` directly.

## Phase 5 — Cover the status matrix (per endpoint)

`200/201`, `400/422` (validation), `401` (unauth), `403` (forbidden), `404` (missing), `409` (conflict),
`204` (no content) — plus every code the spec lists. Multi-call tests → each call in its own `test.step`.

## Phase 6 — Per-field negative coverage

Not just "empty body → 400". Loop each required field omitted, and each field with invalid types
(`for…of` over `INVALID_*`). Fuzz path params. Hand malicious inputs to `security-testing`.

## Phase 7 — Behavior ≠ spec

Write the test as the spec says, `test.skip` it with `// FIXME: <ticket-url>`. **Never loosen the
schema** to make a test pass — drift is a bug to file.

## Checklist

- [ ] Phase-1 gate considered (Playwright is the right tool here).
- [ ] Every response validated against a `z.strictObject` schema.
- [ ] Full status matrix + per-field negatives.
- [ ] Paths via enums, secrets via env. One `@api` tag per test.
