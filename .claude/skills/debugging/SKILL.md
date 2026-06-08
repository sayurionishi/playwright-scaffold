---
name: debugging
description: Use when a test fails, flakes, or behaves unexpectedly. Investigate and fix the root cause — never suppress, never bump timeouts, never silently skip.
---

# Debugging

Never suppress — investigate first, fix second. A green test that hides a real problem is worse than a red one.

## Steps

1. **Read the full error** — type, expected vs received, the failing line.
2. **Classify the mode** (table below).
3. **Reproduce** with the single spec, deterministically: `npx playwright test <file> --project=<p>`.
4. **Investigate** with the right tool: Trace Viewer (`npm run report`), UI Mode (`npm run test:ui`), `--debug` inspector, re-explore with playwright-cli.
5. **Fix at the root cause.**
6. **Re-run.** For a flake fix, run **5× consecutively** green before declaring it fixed.
7. **Green locally, red in CI?** Replay CI: `npm run test:ci -- <file>`.

## Failure mode → cause → fix

| Mode                                        | Likely cause                                              | Fix                                                                                     |
| ------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `TimeoutError` on action/assert             | wrong/changed locator, or waiting on the wrong signal     | re-explore selector (`selectors`); use a pre-registered response wait (`wait-strategy`) |
| Flaky (passes sometimes)                    | bad wait — `waitForTimeout`/`networkidle`/missed response | `wait-strategy`: pre-register before trigger; web-first assert; blur-after-fill         |
| `toBeHidden()` passes but data isn't loaded | loader selector matched zero elements (CSS-module hash)   | `[class*="…"]` partial-match or testid + `.first()`                                     |
| `ZodError` from `.parse(body)`              | response ≠ documented contract (drift)                    | real bug → `test.skip` + `// FIXME`; else fix the schema                                |
| Strict-mode violation (>1 match)            | locator not specific                                      | scope it / `.first()` (`selectors`)                                                     |
| Locator not found                           | markup changed                                            | re-explore; update the page object                                                      |
| "fixture is undefined"                      | not registered / imported from `@playwright/test`         | register in `fixtures/`; import from `test-options`                                     |
| Passes alone, fails in suite                | shared-state coupling                                     | make independent; `@destructive` cleanup (`test-standards`)                             |

## Forbidden "fixes" (these are refusals)

- `try { await expect(...) } catch {}` — swallowing an assertion.
- Raising a timeout to mask a slow/missing signal.
- `test.skip` without a `// FIXME: <ticket>`.
- Loosening a schema / weakening an assertion to turn red green.
