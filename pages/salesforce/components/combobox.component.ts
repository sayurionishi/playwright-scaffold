import type { Locator, Page } from '@playwright/test';

/**
 * `lightning-combobox` (picklist) component object.
 *
 * ⚠️ THE #1 SALESFORCE PICKLIST MISTAKE: a Lightning combobox is NOT a `<select>`. It is a button
 * that opens a listbox. `selectOption()` silently does nothing on it. Always click → click option.
 *
 * The option list may be portalled OUTSIDE the field's container, so options are looked up from the
 * page, not from the field's parent. See `salesforce-locators`.
 */
export class ComboboxComponent {
  private readonly trigger: Locator;

  constructor(
    private readonly page: Page,
    /** The combobox's accessible name — its visible field label. */
    private readonly label: string,
    /** Optional scope (e.g. a modal) so the field resolves uniquely. */
    scope?: Locator,
  ) {
    const root = scope ?? page;
    this.trigger = root.getByRole('combobox', { name: this.label, exact: true });
  }

  /** The closed combobox button — assert on this in a spec. */
  get field(): Locator {
    return this.trigger;
  }

  /** The currently displayed value. */
  get value(): Locator {
    return this.trigger;
  }

  async open(): Promise<void> {
    await this.trigger.click();
  }

  /** An option in the open listbox. Options may render outside the field's DOM subtree. */
  option(value: string): Locator {
    return this.page.getByRole('option', { name: value, exact: true });
  }

  /** Open the combobox and choose a value. */
  async select(value: string): Promise<void> {
    await this.open();
    await this.option(value).click();
  }

  /**
   * All available option values.
   *
   * Useful for asserting a restricted picklist's contents — but note the *available* values can
   * differ per record type and per persona, so pin both before treating this as a contract check.
   * A picklist's true contract lives in `describe`; see `salesforce-metadata-contract`.
   */
  async availableOptions(): Promise<string[]> {
    await this.open();
    return this.page.getByRole('option').allInnerTexts();
  }
}
