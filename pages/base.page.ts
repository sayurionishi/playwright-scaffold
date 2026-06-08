import type { Page, Locator } from '@playwright/test';

/**
 * Abstract base for every page object.
 *
 * NOTE — there is intentionally NO `waitForPageLoad() { waitForLoadState('networkidle') }`
 * here. networkidle is banned (see helpers/util/network.ts and the wait-strategy skill).
 * A page is "loaded" when the element you need is visible — assert that in the spec, or
 * wait for the specific gating response in the page object. Do not wait for the network
 * to fall silent; on an SPA it never does.
 *
 * RULES:
 *  - Locators are declared as class fields at the top of the subclass (locators-on-top).
 *  - Page objects perform ACTIONS and expose locators. They never assert — assertions live in specs.
 *  - `readonly` (public) for locators a spec asserts on; `private readonly` for internal-only.
 */
export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** Navigate to this page's route. Each subclass implements its own. */
  abstract goto(): Promise<void>;

  get url(): string {
    return this.page.url();
  }

  /** Wait for a URL to match. Use for navigations. */
  async waitForUrl(pattern: string | RegExp, timeout = 30_000): Promise<void> {
    await this.page.waitForURL(pattern, { timeout });
  }

  /**
   * Wait for a loader/spinner to disappear.
   * NOTE: CSS-module class names are hashed at build time (e.g. `loader__a1b2c`), so an
   * EXACT `.loader` selector matches zero elements and `toBeHidden()` passes trivially —
   * a false green. Pass a partial match like `[class*="loader"]`, or better, a data-testid.
   */
  async waitForHidden(locator: Locator, timeout = 15_000): Promise<void> {
    await locator.first().waitFor({ state: 'hidden', timeout });
  }
}
