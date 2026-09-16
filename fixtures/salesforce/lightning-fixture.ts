import { test as cleanupTest } from './cleanup-fixture';
import { LightningRecordPage } from '@pages/salesforce/lightning-record.page';
import { ListViewPage } from '@pages/salesforce/list-view.page';

/**
 * Lightning page objects for the project-default `page`.
 *
 * ── WHY THESE ARE FACTORIES, NOT PLAIN FIXTURES ───────────────────────────────────────────────
 *
 * A Lightning record page or list view is meaningless without an sObject, so these cannot be
 * `recordPage: LightningRecordPage` the way `loginPage` can — the test has to say WHICH object.
 * Hence a factory taking the API name, mirroring the shape `asPersona()` already returns for
 * per-persona contexts (`fixtures/salesforce/persona-fixture.ts`).
 *
 * ── WHY THEY EXIST AT ALL ─────────────────────────────────────────────────────────────────────
 *
 * Constitution #10 forbids `new SomePage(page)` in a test, and the flagship Salesforce spec broke
 * it three times — because `asPersona()` provided these factories for a per-persona context but
 * nothing provided them for the project's own `page`. The rule was unenforceable in practice: the
 * only way to obey it did not exist. Making #10 a blocking lint rule required closing that gap
 * first, which is the general shape of this whole phase — enforce a rule and the missing
 * affordance shows up immediately.
 */
export interface SalesforceLightningFixtures {
  /** A Lightning record page for `objectApiName`, bound to the test's default `page`. */
  recordPage: (objectApiName: string) => LightningRecordPage;
  /** A Lightning list view for `objectApiName`, bound to the test's default `page`. */
  listView: (objectApiName: string) => ListViewPage;
}

export const test = cleanupTest.extend<SalesforceLightningFixtures>({
  recordPage: async ({ page }, use) => {
    await use((objectApiName: string) => new LightningRecordPage(page, objectApiName));
  },

  listView: async ({ page }, use) => {
    await use((objectApiName: string) => new ListViewPage(page, objectApiName));
  },
});
