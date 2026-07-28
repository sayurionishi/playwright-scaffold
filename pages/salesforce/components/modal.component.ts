import type { Locator, Page } from '@playwright/test';
import { fillAndBlur } from '../../../helpers/util/forms';
import { ComboboxComponent } from './combobox.component';

/**
 * Lightning modal / dialog component object.
 *
 * ⚠️ ALWAYS SCOPE INSIDE THE DIALOG. Salesforce keeps the record page mounted BEHIND the modal, so
 * an unscoped `getByLabel('Name')` matches the modal field AND the field on the page behind it — a
 * strict-mode violation that reads like an inexplicable duplicate-element bug. Every locator here
 * hangs off `this.dialog` for exactly that reason. See `salesforce-locators`.
 */
export class ModalComponent {
  readonly dialog: Locator;

  constructor(private readonly page: Page) {
    this.dialog = page.getByRole('dialog');
  }

  get heading(): Locator {
    return this.dialog.getByRole('heading');
  }

  get saveButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Save', exact: true });
  }

  get saveAndNewButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Save & New', exact: true });
  }

  get cancelButton(): Locator {
    return this.dialog.getByRole('button', { name: 'Cancel', exact: true });
  }

  get closeButton(): Locator {
    return this.dialog.getByRole('button', { name: /close/i });
  }

  /** A labelled input inside the modal. `exact` because Salesforce labels overlap heavily. */
  input(label: string): Locator {
    return this.dialog.getByLabel(label, { exact: true });
  }

  /** A picklist inside the modal, scoped so it can't collide with the page behind. */
  combobox(label: string): ComboboxComponent {
    return new ComboboxComponent(this.page, label, this.dialog);
  }

  /** Inline validation errors raised on save. */
  get errors(): Locator {
    return this.dialog.getByRole('alert');
  }

  /**
   * Fill a text field and blur it.
   *
   * Lightning inputs commit their dirty flag on BLUR, not on keystroke — `fill()` alone is why the
   * Save button "never enables". See `salesforce-waits`.
   */
  async fillField(label: string, value: string): Promise<void> {
    await fillAndBlur(this.input(label), value);
  }

  /**
   * Click Save. Deliberately does NOT wait — the caller pre-registers `waitForRecordSave` BEFORE
   * calling this, per the golden rule. A page object that waits internally makes pre-registration
   * impossible.
   */
  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async cancel(): Promise<void> {
    await this.cancelButton.click();
  }
}
