import { test as setup } from '@playwright/test';
import { LoginPage } from '../../pages/login.page';
import { appConfig } from '../../config/app.config';

/**
 * Auth setup project — runs ONCE before the UI projects and saves authenticated
 * storage state to `appConfig.storageState`. The `functional` and `e2e` projects
 * depend on this and reuse the state, so individual tests skip the login flow.
 *
 * If the app under test has no login (e.g. a local/kiosk app), the bootstrap
 * skill removes this file and the `setup` project dependency. EXAMPLE as written.
 */
setup('authenticate', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(appConfig.credentials.email, appConfig.credentials.password);

  // Wait for a post-login signal before saving state (replace with a real one for your app).
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 30_000 });

  await page.context().storageState({ path: appConfig.storageState });
});
