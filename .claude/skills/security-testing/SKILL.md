---
name: security-testing
description: Use when adding input-validation / security tests — fuzzing fields and params with SQL injection, XSS, path traversal, command injection, and malformed values. Tagged @security.
---

# Security Testing (input fuzzing)

Every field or parameter that accepts user input MUST be fuzzed. This is the format-error tier of the
API taxonomy (success / format-error / functional-error), elevated to its own tag.

## The rule

A malicious or malformed input must be:

1. **Rejected with a 4xx** (typically 400/422). A **5xx is a finding** — it means the payload reached an unguarded code path.
2. **Never reflected** verbatim (no `<script>` echoed back → stored/reflected XSS).
3. **Never executed** (no traversal reading files, no command execution).
4. **Never leaking** a stack trace, SQL error, or internal path.

## Source the payloads (never inline them)

`test-data/static/util/invalid-values.ts`:

- `SECURITY_PAYLOADS.sqlInjection | xss | pathTraversal | commandInjection`
- `INVALID_IDS`, `INVALID_STRINGS`, `WRONG_TYPES`

## Pattern

```ts
for (const payload of [...SECURITY_PAYLOADS.sqlInjection, ...SECURITY_PAYLOADS.xss]) {
  test(`rejects malicious input: ${payload.slice(0, 24)} @security`, async ({ api }) => {
    const { status, body } = await api.post(ApiEndpoints.USERS, {
      data: { email: payload /* … */ },
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500); // 500 = unguarded path = bug
    expect(JSON.stringify(body)).not.toContain('<script>');
  });
}
```

## Scope

- **API** is the primary target (cheap, deterministic). Fuzz bodies, query params, path params.
- **UI** security tests are rare — only where the client does its own validation worth asserting.
- One `@security` tag per test. `npm run test:security` runs the subset.

## Don't

- Don't only test the empty body. Loop per field, per payload class.
- Don't assert exact error copy for security tests — assert the status class and absence of reflection/leak.
- Don't run destructive payloads against shared/prod data — use seeded, disposable resources.
