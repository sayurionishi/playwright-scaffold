import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { objectList } from '../../enums/salesforce/lightning-routes';
import { DataTableComponent } from './components/datatable.component';
import { ModalComponent } from './components/modal.component';
import { ToastComponent } from './components/toast.component';

/**
 * An object's list view page (`/lightning/o/<Object>/list`).
 *
 * Generic across objects — Lightning list views are structurally identical.
 */
export class ListViewPage extends BasePage {
  readonly table: DataTableComponent;
  readonly modal: ModalComponent;
  readonly toast: ToastComponent;

  constructor(
    page: Page,
    /** Object API name — read from `describe`, never from memory (rule #15). */
    private readonly objectApiName: string,
  ) {
    super(page);
    this.table = new DataTableComponent(page);
    this.modal = new ModalComponent(page);
    this.toast = new ToastComponent(page);
  }

  // ── Locators ───────────────────────────────────────────────────────────────────────────────

  /** `exact: true` — a list view page also carries "New Task", "New Event", etc. */
  get newButton(): Locator {
    return this.page.getByRole('button', { name: 'New', exact: true });
  }

  get refreshButton(): Locator {
    return this.page.getByRole('button', { name: /refresh/i });
  }

  get searchInput(): Locator {
    return this.page.getByPlaceholder(/search this list/i);
  }

  /** The list-view picker (switches between "Recent", "All Accounts", etc.). */
  get listViewPicker(): Locator {
    return this.page.getByRole('button', { name: /select a list view/i });
  }

  /** A row by record name. */
  row(name: string): Locator {
    return this.table.row(name);
  }

  // ── Actions ────────────────────────────────────────────────────────────────────────────────

  async goto(): Promise<void> {
    await this.page.goto(objectList(this.objectApiName));
  }

  /** Navigate to a specific named list view. */
  async gotoFilter(filterName: string): Promise<void> {
    await this.page.goto(objectList(this.objectApiName, filterName));
  }

  /** Open a record from the list. Pre-register `waitForRecordLoad` before calling. */
  async openRecord(name: string): Promise<void> {
    await this.table.recordLink(name).click();
  }

  /** Open the New record modal. */
  async clickNew(): Promise<void> {
    await this.newButton.click();
  }

  /**
   * Refresh the list. A list view does NOT necessarily refresh itself after a record is created
   * elsewhere, so trigger it and pre-register `waitForListRecords`:
   *
   *   const refreshed = waitForListRecords(page);
   *   await listView.refresh();
   *   await refreshed;
   */
  async refresh(): Promise<void> {
    await this.refreshButton.click();
  }

  /** Filter the list by text. Pre-register `waitForListRecords` before calling. */
  async search(text: string): Promise<void> {
    await this.searchInput.fill(text);
    await this.searchInput.press('Enter');
  }

  async switchListView(name: string): Promise<void> {
    await this.listViewPicker.click();
    await this.page.getByRole('option', { name, exact: true }).click();
  }
}
