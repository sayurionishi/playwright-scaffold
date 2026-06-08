---
name: config
description: Use when adding an environment variable, base URL, credential, or environment-driven setting, or when wiring multi-environment runs. Single source of truth for URLs and secrets.
---

# Config & Environments

URLs and credentials come from the environment, never hardcoded.

## Loading

`playwright.config.ts` reads `ENVIRONMENT` (default `dev`) and loads `env/.env.<environment>` via
dotenv. Files: `env/.env.dev`, `.env.staging`, `.env.prod`, `.env.ci` — all gitignored; only
`*.example` is tracked.

```
ENVIRONMENT=staging npx playwright test     # loads env/.env.staging
```

## Where a value belongs

| Value                                              | Home                                                 |
| -------------------------------------------------- | ---------------------------------------------------- |
| Base URL, API URL, credentials, env-driven setting | `process.env.*`, surfaced via `config/app.config.ts` |
| Endpoint path, route, UI message                   | `enums/` (NOT config)                                |

## Rules

- Add new vars to **`env/.env.<env>.example`** (and your real env file) so the contract is documented.
- Read via `appConfig.*` (which reads `process.env.*` with `??` fallback or the `required()` guard).
  Never `process.env.X as string`.
- Add a typed `appConfig` property only if the value is reused or needs a guard; otherwise read `process.env.*` directly.
- Never commit a real secret. Never print a credential to the console/report.

## CI

`CI=1` is set in GitHub Actions; `appConfig.isCI` and `playwright.config.ts` use it to enable retries
and the GitHub reporter. Replay CI locally: `npm run test:ci`.
