import { test, expect } from '../../fixtures/test-options';

/**
 * ⭐ REFERENCE IMPLEMENTATION — keep this green.
 *
 * The golden end-to-end journey (one test for the whole flow) — what the assistant copies when asked
 * for a new one, so it must obey every rule it demonstrates. If a Constitution rule changes, re-read this file:
 * a reference that violates the current rules teaches the violation.
 *
 * EXAMPLE end-to-end journey — a full multi-feature flow is the system under test.
 * ONE test for the whole journey (not one per step). Tagged @e2e. Runs authenticated
 * (the `e2e` project depends on the `setup` project's stored auth state).
 *
 * API-as-setup belongs here: seed prerequisite data via the `api`/helper fixtures so the
 * journey focuses on user-facing behavior, then assert through the UI with web-first asserts.
 *
 * Note there are no locators and no `page.goto` in this file: every locator lives in a page object
 * (Constitution #9) and each page object is consumed via its fixture, never constructed here
 * (Constitution #10). Both are lint-enforced — see docs/PARITY-MATRIX.md.
 */
test.describe('User journey', () => {
  test(
    'signed-in user lands on the dashboard and can open products',
    { tag: '@e2e' },
    async ({ dashboardPage, productsPage }) => {
      await test.step('Given I am authenticated and on the dashboard', async () => {
        await dashboardPage.goto();
        await expect(dashboardPage.heading).toBeVisible();
      });

      await test.step('When I navigate to products', async () => {
        await dashboardPage.openProducts();
      });

      await test.step('Then the products list is shown', async () => {
        await expect(productsPage.heading).toBeVisible();
      });
    },
  );
});
