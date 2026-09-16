import { test, expect } from '@fixtures/test-options';
import { UiMessages } from '@enums/util/ui-messages';

/**
 * ⭐ REFERENCE IMPLEMENTATION — keep this green.
 *
 * The golden functional spec (one screen is the SUT) — what the assistant copies when asked
 * for a new one, so it must obey every rule it demonstrates. If a Constitution rule changes, re-read this file:
 * a reference that violates the current rules teaches the violation.
 *
 * EXAMPLE functional tests — one screen is the system under test.
 *
 * Conventions on show:
 *  - import { test, expect } from the single fixtures entry point (never @playwright/test)
 *  - exactly ONE tag per test (@smoke | @sanity | @regression); @destructive always wins
 *  - Given/When/Then via test.step for readable reports (BDD variant; the api specs use the
 *    AAA variant — both are fine, same three-beat shape, see the test-standards skill)
 *  - assertions live HERE, never in the page object
 *  - web-first assertions only (no waitForTimeout, no networkidle)
 *
 * This suite tests the login screen itself, so it starts UNAUTHENTICATED (override the
 * project's stored auth state).
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login', () => {
  test.beforeEach(async ({ loginPage }) => {
    await loginPage.goto();
  });

  test('shows the sign-in form', { tag: '@smoke' }, async ({ loginPage }) => {
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.signInButton).toBeEnabled();
  });

  test('rejects invalid credentials', { tag: '@regression' }, async ({ loginPage, page }) => {
    await test.step('When I submit wrong credentials', async () => {
      await loginPage.login('wrong@example.com', 'badpassword');
    });

    await test.step('Then I see an error and stay on /login', async () => {
      await expect(loginPage.errorMessage).toContainText(UiMessages.LOGIN_ERROR_INVALID);
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
