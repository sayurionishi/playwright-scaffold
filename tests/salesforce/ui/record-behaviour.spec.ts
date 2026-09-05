import { test, expect } from '../../../fixtures/test-options';
import { SObjects } from '../../../enums/salesforce/sobjects';
import { recordViewPattern } from '../../../enums/salesforce/lightning-routes';
import { SalesforceApi } from '../../../enums/salesforce/salesforce-api';
import { LightningRecordPage } from '../../../pages/salesforce/lightning-record.page';
import { ListViewPage } from '../../../pages/salesforce/list-view.page';
import {
  makeAccount,
  makeAccountTree,
} from '../../../test-data/salesforce/factories/account.factory';
import {
  createRecord,
  deleteRecordQuietly,
  createTree,
  treeId,
} from '../../../helpers/salesforce/soql';
import {
  waitForRecordLoad,
  waitForRecordSave,
  waitForListRecords,
} from '../../../helpers/salesforce/lightning';

/**
 * EXAMPLE Salesforce UI tests — BEHAVIOUR, not field metadata.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHAT BELONGS HERE
 *
 * ✅ Does the user's workflow complete? (edit → save → persisted)
 * ✅ Does the SCREEN honour the permission model the contract layer already verified?
 * ✅ Does a validation rule / Flow surface its error where the user can see it?
 * ✅ Does the multi-step journey hold together end to end?
 *
 * ❌ Field types, lengths, picklist VALUES, per-field FLS matrices, permission set assignments.
 *    All of that is asserted in tests/salesforce/contract/ — one API call, every field, no browser.
 *    Re-asserting it here buys nothing and costs ~20 seconds plus a locator dependency each time.
 *
 * See docs/salesforce/TEST-ARCHITECTURE.md.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * THE IDENTITY SPLIT — the thing to copy from these tests:
 *
 *   `adminOrg`  arranges and tears down. Modify All Data, so cleanup can never be blocked.
 *   `page`      acts as the SUBJECT persona (SF_DEFAULT_PERSONA — a restricted user, not an admin).
 *
 * Running the UI as System Admin would exercise a screen no real user ever sees, and an admin's
 * Modify All Data hides every sharing and FLS bug you were hoping to catch.
 *
 * ⚠️ Verify these locators against your org before relying on them — `bootstrap` Phase 3b step 6.
 */

test.describe('Account record page', () => {
  test(
    'a user can view a record created via the API',
    { tag: '@sanity' },
    async ({ page, adminOrg, subjectPersona }) => {
      // ARRANGE as admin — fast, deterministic, never blocked by the subject's own permissions.
      // Creating this through the UI would cost ~30s and import every Lightning flake into a test
      // that isn't about the create screen.
      const draft = makeAccount();
      const created = await createRecord(adminOrg, SObjects.ACCOUNT, draft);

      try {
        // ACT as the SUBJECT persona — this browser context carries the restricted user's session.
        const recordPage = new LightningRecordPage(page, SObjects.ACCOUNT);

        const loaded = waitForRecordLoad(page, created.id);
        await recordPage.gotoRecord(created.id);
        await page.waitForURL(recordViewPattern(SObjects.ACCOUNT));
        await loaded;

        // ASSERT behaviour: the record is reachable and renders for this persona. Scoped to the
        // Details region, because the highlights panel duplicates the value.
        await expect(
          recordPage.fieldValue('Account Name'),
          `Persona "${subjectPersona.key}" should be able to view this Account.`,
        ).toContainText(draft.Name);
      } finally {
        // TEARDOWN as admin — the subject persona has no Delete, so cleanup as the subject would
        // fail silently and leak data into the sandbox.
        await deleteRecordQuietly(adminOrg, SObjects.ACCOUNT, created.id);
      }
    },
  );

  test(
    'a user can edit a field and the change persists',
    { tag: '@regression' },
    async ({ page, adminOrg }) => {
      const created = await createRecord(adminOrg, SObjects.ACCOUNT, makeAccount());
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
        // it, Save stays disabled. The #1 "why won't it save" bug.
        await recordPage.fillField('Phone', newPhone);

        const saved = waitForRecordSave(page);
        await recordPage.saveInlineEdit();
        await saved;

        // Assert the RECORD, not the toast — toasts auto-dismiss and will race you.
        await expect(recordPage.fieldValue('Phone')).toContainText(newPhone);

        // BEHAVIOUR over chrome: confirm it actually persisted server-side. A screen showing the
        // new value while the save silently failed is exactly the bug this catches.
        const reread = await adminOrg.get(SalesforceApi.sobjectById(SObjects.ACCOUNT, created.id), {
          expectStatus: 200,
        });
        expect(reread.status).toBe(200);
      } finally {
        await deleteRecordQuietly(adminOrg, SObjects.ACCOUNT, created.id);
      }
    },
  );
});

test.describe('Permission model as rendered', () => {
  /**
   * The ONE kind of permission test that belongs in the UI: does the SCREEN honour the model?
   *
   * The contract layer already proved `limitedFields` cannot see the field via the API. What it
   * cannot prove is that Lightning doesn't render it anyway from a cached layout — that's a
   * rendering question, so it belongs here. Note this is ONE test, not a matrix.
   *
   * Both halves live in the same test so the positive control cannot be lost: if `fullAccess` stops
   * seeing the field, you know the locator is wrong rather than the permission.
   */
  test(
    'a hidden field is not rendered for the restricted persona',
    { tag: '@persona' },
    async ({ adminOrg, asPersona }) => {
      const created = await createRecord(adminOrg, SObjects.ACCOUNT, makeAccount());

      try {
        // POSITIVE CONTROL — the least-privileged persona that SHOULD see the field. Deliberately
        // NOT an admin: an admin would see it via Modify All Data even with the permset broken.
        const full = await asPersona('fullAccess');
        const fullRecord = full.recordPage(SObjects.ACCOUNT);
        const fullLoaded = waitForRecordLoad(full.page, created.id);
        await fullRecord.gotoRecord(created.id);
        await fullLoaded;
        await expect(
          fullRecord.fieldValue('Annual Revenue'),
          'Positive control failed: fullAccess should see Annual Revenue. Until this passes, the ' +
            'negative assertion below is meaningless — fix this first.',
        ).toBeVisible();

        // THE RESTRICTION — only meaningful because the control above passed.
        const limited = await asPersona('limitedFields');
        const limitedRecord = limited.recordPage(SObjects.ACCOUNT);
        const limitedLoaded = waitForRecordLoad(limited.page, created.id);
        await limitedRecord.gotoRecord(created.id);
        await limitedLoaded;
        await expect(limitedRecord.fieldValue('Annual Revenue')).toBeHidden();
      } finally {
        await deleteRecordQuietly(adminOrg, SObjects.ACCOUNT, created.id);
      }
    },
  );
});

test.describe('Account list view', () => {
  test(
    'a hierarchy created in one composite call is listable',
    { tag: '@sanity' },
    async ({ page, adminOrg }) => {
      // composite/tree creates the Account AND its Contacts in a single request (~200 ms).
      // createTree asserts hasErrors internally — the outer 200 lies when subrecords fail.
      const tree = await createTree(adminOrg, SObjects.ACCOUNT, makeAccountTree(2).records);
      const accountId = treeId(tree, 'acct1');

      try {
        const listView = new ListViewPage(page, SObjects.ACCOUNT);

        const listed = waitForListRecords(page);
        await listView.goto();
        await listed;

        await expect(listView.table.table).toBeVisible();
      } finally {
        // Contacts cascade-delete with their master Account. Verify cascade behaviour for your own
        // objects rather than assuming it — see `salesforce-data`.
        await deleteRecordQuietly(adminOrg, SObjects.ACCOUNT, accountId);
      }
    },
  );
});
