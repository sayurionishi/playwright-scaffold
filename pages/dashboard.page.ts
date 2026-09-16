import type { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { Routes } from '@enums/util/routes';

/**
 * EXAMPLE page object for the post-login landing screen. Replace the locators with your app's real
 * dashboard.
 *
 * Exists so the e2e journey has somewhere to put its locators: Constitution #9 says locators live
 * in page objects only, and the example journey was reaching for `page.getByRole(...)` directly
 * because no `DashboardPage` existed. A rule you cannot obey is not a rule.
 */
export class DashboardPage extends BasePage {
  // ── Locators (semantic-first; `bootstrap` flips these to testId on the controlled profile) ──
  readonly heading: Locator = this.page.getByRole('heading', { name: /dashboard/i });
  readonly productsLink: Locator = this.page.getByRole('link', { name: /products/i });

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(Routes.DASHBOARD);
  }

  /**
   * Navigate to the products list.
   *
   * Waits for the URL rather than a response: this is a client-side route change in the example
   * app, so there is no single gating request to pre-register. If your app fetches on navigation,
   * pre-register that response instead — see `wait-strategy`.
   */
  async openProducts(): Promise<void> {
    await this.productsLink.click();
    await this.page.waitForURL(`**${Routes.PRODUCTS}`);
  }
}
