# Profile: generic

For a generic web app where you do NOT control the source (can't add `data-testid` freely).

- **Locator priority:** `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText` → `getByTestId`
  (Playwright's official user-facing-first order).
- **Waits:** deterministic — pre-registered `waitForRest`/`waitForGraphQL` + web-first assertions. No `networkidle`.
- **Auth:** keep `setup` project + `auth.setup.ts` if there's a login; otherwise remove them.
- **Projects:** `api` (for setup/teardown + any contract checks), `setup`, `functional`, `e2e`.
- **Notes:** this is the safe default. Add `data-testid` only where the app team will accept a PR.
