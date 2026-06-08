---
name: enums
description: Use when adding a repeated app-defined string — an endpoint path, a UI route, or a user-facing message that tests assert on. Single source of truth for these constants.
---

# Enums (app-defined constant strings)

`enums/` holds the strings the app defines and tests repeat. One definition, imported everywhere.

| Kind                   | File                          | Example                                  |
| ---------------------- | ----------------------------- | ---------------------------------------- |
| API endpoint path      | `enums/util/api-endpoints.ts` | `ApiEndpoints.USER_BY_ID = '/users/:id'` |
| UI route               | `enums/util/routes.ts`        | `Routes.DASHBOARD = '/dashboard'`        |
| UI message asserted on | `enums/util/ui-messages.ts`   | `UiMessages.LOGIN_ERROR_INVALID`         |

App-specific groups go in `enums/{area}/*`. Shared ones in `enums/util/*`.

## Rules

- These are **constant objects `as const`**, not TS `enum` (better tree-shaking + literal types). Export the value object and a `type` of its values.
- **Paths only** for endpoints — never the full URL (host comes from `appConfig.apiUrl`). Use `buildPath()` for `:params`.
- **Verify UI message strings against the live app** (playwright-cli) before adding. Never guess copy.
- Don't put URLs or credentials here — those are env/config. Don't put dynamic/computed values here.

## When to add vs inline

Add to enums when the string is app-defined AND repeated (2+ uses) or asserted on. A truly one-off
literal can stay inline. When in doubt for endpoints/routes/messages, add it — they change and you
want one place to update.
