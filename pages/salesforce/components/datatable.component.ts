import type { Locator, Page } from '@playwright/test';

/**
 * `lightning-datatable` / list-view grid component object.
 *
 * Lightning datatables expose proper ARIA grid semantics, so use them — never reach for a row by
 * index. See `salesforce-locators`.
 *
 * TWO TRAPS:
 *  1. The header is also a `row`. `.filter({ hasText })` normally excludes it, but a header cell
 *     matching your text will NOT be excluded — scope carefully when filtering on column-like text.
 *  2. VIRTUAL SCROLLING: offscreen rows are not in the DOM at all. A row you "can't find" may just
 *     need scrolling. Do not raise the timeout — that never helps, since the row is genuinely absent.
 */
export class DataTableComponent {
  private readonly grid: Locator;

  constructor(page: Page, scope?: Locator) {
    const root = scope ?? page;
    this.grid = root.getByRole('grid');
  }

  /** The grid itself — assert visibility/row counts on this. */
  get table(): Locator {
    return this.grid;
  }

  /** Data rows only (excludes the header row). */
  get rows(): Locator {
    return this.grid.getByRole('row').filter({ has: this.grid.page().getByRole('gridcell') });
  }

  /** A row containing the given text — typically a record name. */
  row(text: string): Locator {
    return this.rows.filter({ hasText: text });
  }

  /** A specific cell in a row, by column header name. */
  cell(rowText: string, columnName: string): Locator {
    return this.row(rowText).getByRole('gridcell').filter({ hasText: columnName });
  }

  /** The row's record link — clicking it navigates to the record page. */
  recordLink(rowText: string): Locator {
    return this.row(rowText).getByRole('link').first();
  }

  /** The row-level action menu (the ▾ button at the end of a row). */
  rowActions(rowText: string): Locator {
    return this.row(rowText).getByRole('button', { name: /actions|show more/i });
  }

  /** Sort by a column header. */
  async sortBy(columnName: string): Promise<void> {
    await this.grid.getByRole('columnheader', { name: columnName }).getByRole('button').click();
  }

  /**
   * Scroll until a row is present, for virtualized grids.
   *
   * This is NOT a wait-for-element — it's a scroll loop, because the row genuinely isn't rendered
   * yet. Bounded so a missing row fails fast instead of spinning.
   */
  async scrollToRow(rowText: string, maxScrolls = 20): Promise<Locator> {
    const target = this.row(rowText);
    for (let attempt = 0; attempt < maxScrolls; attempt += 1) {
      if ((await target.count()) > 0) return target;
      await this.rows.last().scrollIntoViewIfNeeded();
    }
    return target;
  }
}
