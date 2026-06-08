import type { Page, Locator } from '@playwright/test';

/**
 * EXAMPLE component object — a reusable UI pattern composed into page objects.
 *
 * Extract a component only when a pattern appears in 3+ page objects (proven duplication).
 * Components take the scope they live in (a Page or a parent Locator) so they can be reused
 * inside modals, panels, etc.
 *
 * NOTE: this search does NOT auto-search on type in many apps — it triggers on Enter or a
 * button click. Verify the real behavior with playwright-cli before wiring it.
 */
export class SearchComponent {
  private readonly input: Locator;
  private readonly submitButton: Locator;

  constructor(scope: Page | Locator, placeholder: string) {
    this.input = scope.getByPlaceholder(placeholder);
    this.submitButton = scope.getByRole('button', { name: /search/i });
  }

  /** Type a query and submit it. Most inputs commit on Enter; some need the button. */
  async search(query: string, via: 'enter' | 'button' = 'enter'): Promise<void> {
    await this.input.fill(query);
    if (via === 'button') {
      await this.submitButton.click();
    } else {
      await this.input.press('Enter');
    }
  }

  async clear(): Promise<void> {
    await this.input.clear();
    await this.input.press('Enter');
  }
}
