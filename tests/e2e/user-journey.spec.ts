import { test, expect } from '../../fixtures/test-options';
import { Routes } from '../../enums/util/routes';

/**
 * EXAMPLE end-to-end journey — a full multi-feature flow is the system under test.
 * ONE test for the whole journey (not one per step). Tagged @e2e. Runs authenticated
 * (the `e2e` project depends on the `setup` project's stored auth state).
 *
 * API-as-setup belongs here: seed prerequisite data via the `api`/helper fixtures so the
 * journey focuses on user-facing behavior, then assert through the UI with web-first asserts.
 */
test.describe('User journey @e2e', () => {
  test('signed-in user lands on the dashboard and can open products', async ({ page }) => {
    await test.step('Given I am authenticated and on the dashboard', async () => {
      await page.goto(Routes.DASHBOARD);
      await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible();
    });

    await test.step('When I navigate to products', async () => {
      await page.getByRole('link', { name: /products/i }).click();
      await page.waitForURL(`**${Routes.PRODUCTS}`);
    });

    await test.step('Then the products list is shown', async () => {
      await expect(page.getByRole('heading', { name: /products/i })).toBeVisible();
    });
  });
});
