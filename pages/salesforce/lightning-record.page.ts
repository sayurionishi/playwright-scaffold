import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base.page';
import { recordView, recordEdit } from '../../enums/salesforce/lightning-routes';
import { fillAndBlur } from '../../helpers/util/forms';
import { ComboboxComponent } from './components/combobox.component';
import { ModalComponent } from './components/modal.component';
import { ToastComponent } from './components/toast.component';

/**
 * A Lightning record detail page (`/lightning/r/<Object>/<id>/view`).
 *
 * Generic across objects on purpose: Lightning record pages are structurally identical, so one page
 * object serves Account, Opportunity, and your custom objects. Subclass it only when an object has
 * genuinely bespoke UI.
 *
 * Per the scaffold constitution this page object ACTS and exposes locators — it never asserts, and
 * it never waits internally (the caller pre-registers waits, per the golden rule).
 */
export class LightningRecordPage extends BasePage {
  readonly modal: ModalComponent;
  readonly toast: ToastComponent;

  constructor(
    page: Page,
    /** The object's API name. Read it from `describe` — never write it from memory (rule #15). */
    private readonly objectApiName: string,
  ) {
    super(page);
    this.modal = new ModalComponent(page);
    this.toast = new ToastComponent(page);
  }

  // ── Locators (locators-on-top) ─────────────────────────────────────────────────────────────

  /** The Details region — scope field lookups here to dodge the highlights-panel collision. */
  get detailsRegion(): Locator {
    return this.page.getByRole('region', { name: /details/i });
  }

  /** The compact-layout summary at the top of the record. */
  get highlightsPanel(): Locator {
    return this.page.getByRole('region', { name: /highlights/i });
  }

  get detailsTab(): Locator {
    return this.page.getByRole('tab', { name: 'Details' });
  }

  get relatedTab(): Locator {
    return this.page.getByRole('tab', { name: 'Related' });
  }

  get editButton(): Locator {
    return this.page.getByRole('button', { name: 'Edit', exact: true });
  }

  get inlineSaveButton(): Locator {
    return this.page.getByRole('button', { name: 'Save', exact: true });
  }

  // ── Field access ───────────────────────────────────────────────────────────────────────────

  /**
   * A field's value on the record page, located by its label.
   *
   * ⚠️ THE BIG SALESFORCE STRICT-MODE TRAP: the highlights panel duplicates detail-panel values, so
   * a bare `getByText('Acme Corp')` matches TWICE. This scopes to the Details region and finds the
   * layout item carrying the label.
   *
   * Never disambiguate that collision with `.first()` — which of the two copies you get is not
   * stable. See `salesforce-locators`.
   */
  fieldValue(label: string): Locator {
    return this.detailsRegion
      .getByRole('listitem')
      .filter({ has: this.page.getByText(label, { exact: true }) });
  }

  /** The inline-edit pencil for a field. */
  editFieldButton(label: string): Locator {
    return this.detailsRegion.getByRole('button', { name: new RegExp(`edit ${label}`, 'i') });
  }

  /** An input in inline-edit or edit mode. */
  input(label: string): Locator {
    return this.page.getByLabel(label, { exact: true });
  }

  /** A picklist on the record form. */
  combobox(label: string): ComboboxComponent {
    return new ComboboxComponent(this.page, label);
  }

  // ── Actions ────────────────────────────────────────────────────────────────────────────────

  /**
   * BasePage requires a `goto()`, but a record page needs an Id — call `gotoRecord(id)`.
   * Throwing here is deliberate: a silent no-op would produce a confusing downstream failure.
   */
  async goto(): Promise<void> {
    throw new Error('LightningRecordPage.goto() needs a record Id — use gotoRecord(id) instead.');
  }

  /**
   * Navigate to a record. The caller pre-registers `waitForRecordLoad` before calling this:
   *
   *   const loaded = waitForRecordLoad(page, id);
   *   await recordPage.gotoRecord(id);
   *   await loaded;
   */
  async gotoRecord(recordId: string): Promise<void> {
    await this.page.goto(recordView(this.objectApiName, recordId));
  }

  async gotoRecordEdit(recordId: string): Promise<void> {
    await this.page.goto(recordEdit(this.objectApiName, recordId));
  }

  /** Open the full edit modal. */
  async openEdit(): Promise<void> {
    await this.editButton.click();
  }

  /**
   * Fill a field and blur so Lightning commits its dirty flag. Without the blur, Save can stay
   * disabled — the single most common "why won't it save" bug. See `salesforce-waits`.
   */
  async fillField(label: string, value: string): Promise<void> {
    await fillAndBlur(this.input(label), value);
  }

  /** Start inline editing a field. */
  async startInlineEdit(label: string): Promise<void> {
    await this.editFieldButton(label).click();
  }

  /** Commit an inline edit. Pre-register `waitForRecordSave` before calling. */
  async saveInlineEdit(): Promise<void> {
    await this.inlineSaveButton.click();
  }

  async openDetailsTab(): Promise<void> {
    await this.detailsTab.click();
  }
}
