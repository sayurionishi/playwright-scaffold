import type { Page, Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { Routes } from '../enums/util/routes';

/**
 * EXAMPLE page object for a product list. Replace the locators with your app's real screen.
 *
 * `rowByName` is the shape to copy for any list: return a LOCATOR scoped to the row, so the spec
 * can assert presence, absence, or content on it. Asserting "the table is visible" instead is a
 * false green — it passes on an empty list.
 */
export class ProductsPage extends BasePage {
  readonly heading: Locator = this.page.getByRole('heading', { name: /products/i });
  readonly list: Locator = this.page.getByRole('list', { name: /products/i });

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(Routes.PRODUCTS);
  }

  /** One product row by its visible name. */
  rowByName(name: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: name });
  }
}
