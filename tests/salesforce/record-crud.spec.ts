import { test, expect } from '../../fixtures/test-options';
import { SObjects } from '../../enums/salesforce/sobjects';
import { recordViewPattern } from '../../enums/salesforce/lightning-routes';
import { LightningRecordPage } from '../../pages/salesforce/lightning-record.page';
import { ListViewPage } from '../../pages/salesforce/list-view.page';
import { makeAccount, makeAccountTree } from '../../test-data/salesforce/factories/account.factory';
import {
  createRecord,
  deleteRecordQuietly,
  createTree,
  treeId,
} from '../../helpers/salesforce/soql';
import {
  waitForRecordLoad,
  waitForRecordSave,
  waitForListRecords,
} from '../../helpers/salesforce/lightning';

/**
 * EXAMPLE Salesforce UI tests. Runs in the `functional` project as the default persona.
 *
 * Demonstrates the pack's core patterns:
 *  - Records created via the API, never through the UI (`salesforce-data`)
 *  - Waits pre-registered on ui-api paths, never networkidle or /aura (`salesforce-waits`)
 *  - Locators from component objects, scoped to dodge highlights-panel collisions
 *  - Cleanup that runs even on failure
 *
 * ⚠️ These are examples against standard objects. Verify the locators against your org before
 * relying on them — `bootstrap` Phase 3b step 6.
 */

test.describe('Account record page', () => {
  test('displays a record created via the API', { tag: '@sanity' }, async ({ page, org }) => {
    // ARRANGE — API setup. Creating this through the UI would cost ~30s and import every
    // Lightning flake into a test that isn't about the create screen.
    const draft = makeAccount();
    const created = await createRecord(org, SObjects.ACCOUNT, draft);

    try {
      const recordPage = new LightningRecordPage(page, SObjects.ACCOUNT);

      // ACT — pre-register the load BEFORE navigating (the golden rule). Lightning routes
      // client-side, so the URL settles before the data arrives; wait for both.
      const loaded = waitForRecordLoad(page, created.id);
      await recordPage.gotoRecord(created.id);
      await page.waitForURL(recordViewPattern(SObjects.ACCOUNT));
      await loaded;

      // ASSERT — scoped to the Details region, because the highlights panel duplicates the
      // same value and an unscoped getByText would be a strict-mode violation.
      await expect(recordPage.fieldValue('Account Name')).toContainText(draft.Name);
    } finally {
      // Teardown runs on failure too, so test data never leaks into a shared sandbox.
      await deleteRecordQuietly(org, SObjects.ACCOUNT, created.id);
    }
  });

  test('saves an inline edit to a field', { tag: '@regression' }, async ({ page, org }) => {
    const created = await createRecord(org, SObjects.ACCOUNT, makeAccount());
    const newPhone = '+1 555 0100';

    try {
      const recordPage = new LightningRecordPage(page, SObjects.ACCOUNT);

      const loaded = waitForRecordLoad(page, created.id);
      await recordPage.gotoRecord(created.id);
      await loaded;

      // `toBeEnabled` rather than `toBeVisible`: Lightning renders the shell before components
      // hydrate, so a visible button can have no click handler yet.
      await expect(recordPage.editButton).toBeEnabled();

      await recordPage.startInlineEdit('Phone');
      // fillField blurs — Lightning commits its dirty flag on blur, not on keystroke. Without
      // it, Save stays disabled. This is the #1 "why won't it save" bug.
      await recordPage.fillField('Phone', newPhone);

      const saved = waitForRecordSave(page);
      await recordPage.saveInlineEdit();
      await saved;

      // Assert the RECORD, not the toast — toasts auto-dismiss and will race you.
      await expect(recordPage.fieldValue('Phone')).toContainText(newPhone);
    } finally {
      await deleteRecordQuietly(org, SObjects.ACCOUNT, created.id);
    }
  });
});

test.describe('Account list view', () => {
  test(
    'shows an account hierarchy created in one composite call',
    { tag: '@sanity' },
    async ({ page, org }) => {
      // composite/tree creates the Account AND its Contacts in a single request (~200 ms).
      // createTree asserts hasErrors internally — the outer 200 lies when subrecords fail.
      const tree = await createTree(org, SObjects.ACCOUNT, makeAccountTree(2).records);
      // treeId throws if the reference is missing, so this is a `string` — no conditional needed
      // in teardown to satisfy the type.
      const accountId = treeId(tree, 'acct1');

      try {
        const listView = new ListViewPage(page, SObjects.ACCOUNT);

        // A list view does not necessarily refresh itself after an external create — pre-register
        // the list-records response and trigger it.
        const listed = waitForListRecords(page);
        await listView.goto();
        await listed;

        await expect(listView.table.table).toBeVisible();
      } finally {
        // Contacts cascade-delete with their master Account. Verify cascade behavior for your own
        // objects rather than assuming it — see `salesforce-data`.
        await deleteRecordQuietly(org, SObjects.ACCOUNT, accountId);
      }
    },
  );
});
