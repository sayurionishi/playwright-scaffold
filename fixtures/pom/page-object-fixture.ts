import { test as base } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';

/**
 * Page-object dependency injection. Register every page object here once; tests then
 * receive ready instances via destructuring and NEVER call `new SomePage(page)`.
 *
 * Pattern per page object:
 *   somePage: async ({ page }, use) => { await use(new SomePage(page)); },
 * Add `await somePage.goto()` before `use` only if EVERY test that uses it starts there.
 */
export interface PomFixtures {
  loginPage: LoginPage;
}

export const test = base.extend<PomFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
});
