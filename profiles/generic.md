# Profile: generic

For a generic web app where you do NOT control the source (can't add `data-testid` freely).

- **Locator priority:** `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText` → `getByTestId`
  (Playwright's official user-facing-first order).
- **Waits:** deterministic — pre-registered `waitForRest`/`waitForGraphQL` + web-first assertions. No `networkidle`.
- **Auth:** nothing to do either way. The `setup` project only exists when `TEST_USER_EMAIL` is set,
  and the UI projects derive their `dependencies`/`storageState` from the same flag — so leave
  `helpers/auth/auth.setup.ts` in place on a no-login app; it is never collected.
- **Projects:** `api` (for setup/teardown + any contract checks), `setup`, `functional`, `e2e`.
- **Browsers:** Chromium only (`devices['Desktop Chrome']`), on every UI project. A deliberate
  choice, not an omission — see `docs/TARGET-FIT.md` §4 and widen it there if your risk calls for it.
- **Notes:** this is the safe default. Add `data-testid` only where the app team will accept a PR.

## If the target is a chatty enterprise SPA

Workday, SAP Fiori, ServiceNow, Dynamics and friends land on this profile because there is no
dedicated one. Apply one Salesforce lesson to them: **treat Constitution #2 as a refusal, not a
warning.** They poll continuously, so the network never goes quiet for the 500 ms `networkidle`
requires — the wait either hangs to timeout or resolves in a random gap between requests. Use
`helpers/util/network.ts` and pre-register the specific gating response. Their generated markup
churns like Lightning's too, so prefer role and label engines over anything structural.
