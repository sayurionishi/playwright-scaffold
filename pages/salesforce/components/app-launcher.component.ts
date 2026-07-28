import type { Locator, Page } from '@playwright/test';

/**
 * App Launcher / global navigation.
 *
 * Also serves as the canonical "am I authenticated?" signal — the App Launcher button only exists
 * in an authenticated Lightning shell, which is why `personas.setup.ts` asserts on it.
 */
export class AppLauncherComponent {
  constructor(private readonly page: Page) {}

  get button(): Locator {
    return this.page.getByRole('button', { name: 'App Launcher' });
  }

  get searchInput(): Locator {
    return this.page.getByPlaceholder(/search apps and items/i);
  }

  async open(): Promise<void> {
    await this.button.click();
  }

  /** Open an app by name. Prefer navigating straight to a route where you can — it's far faster. */
  async openApp(appName: string): Promise<void> {
    await this.open();
    await this.searchInput.fill(appName);
    await this.page.getByRole('link', { name: appName, exact: true }).click();
  }

  /**
   * An object tab in the nav bar.
   *
   * `exact: true` matters: a record page carries "New Task", "New Event", "New Note" and similar
   * overlapping names simultaneously.
   */
  navItem(label: string): Locator {
    return this.page.getByRole('link', { name: label, exact: true });
  }
}
