import { test, expect } from '@fixtures/test-options';
import { SObjects } from '@enums/salesforce/sobjects';
import { recordViewPattern } from '@enums/salesforce/lightning-routes';
import { SalesforceApi } from '@enums/salesforce/salesforce-api';
import { makeAccount, makeAccountTree } from '@test-data/salesforce/factories/account.factory';
import { treeId } from '@helpers/salesforce/soql';
import { AccountPhoneSchema } from '@fixtures/salesforce/schemas/account.schema';
import {
  waitForRecordLoad,
  waitForRecordSave,
  waitForListRecords,
} from '@helpers/salesforce/lightning';

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
    async ({ page, recordPage: makeRecordPage, trackedRecords, subjectPersona }) => {
      // ARRANGE as admin — fast, deterministic, never blocked by the subject's own permissions.
      // Creating this through the UI would cost ~30s and import every Lightning flake into a test
      // that isn't about the create screen.
      //
      // `trackedRecords.create` creates as admin AND registers the record for teardown in FIXTURE
      // scope. A `try/finally` here would not survive a test timeout — and a Lightning timeout is
      // the most likely way this test fails. See fixtures/salesforce/cleanup-fixture.ts.
      const draft = makeAccount();
      const created = await trackedRecords.create(SObjects.ACCOUNT, draft);

      // ACT as the SUBJECT persona — this browser context carries the restricted user's session.
      const recordPage = makeRecordPage(SObjects.ACCOUNT);

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
    },
  );

  test(
    'a user can edit a field and the change persists',
    { tag: '@regression' },
    async ({ page, recordPage: makeRecordPage, adminOrg, trackedRecords }) => {
      const created = await trackedRecords.create(SObjects.ACCOUNT, makeAccount());
      const newPhone = '+1 555 0100';

      const recordPage = makeRecordPage(SObjects.ACCOUNT);

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

      // BEHAVIOUR over chrome: confirm it actually persisted server-side. A screen showing the new
      // value while the save silently failed is exactly the bug this catches.
      //
      // ⚠️ Assert the FIELD, not the status. `expectStatus: 200` already fails the request if the
      // status is anything else, so a follow-up `expect(reread.status).toBe(200)` is tautological —
      // it re-checks a condition that has already been enforced and can never fail on its own. The
      // only assertion that actually catches a silent save failure is reading the value back.
      const { data: reread } = await adminOrg.get(
        SalesforceApi.sobjectById(SObjects.ACCOUNT, created.id),
        // `fields` is required, not an optimisation: without it Salesforce returns every visible
        // field and the strict schema below would reject the extras. See account.schema.ts.
        { expectStatus: 200, params: { fields: 'Phone' }, schema: AccountPhoneSchema },
      );
      expect(reread.Phone, 'The UI showed the new Phone but the server did not persist it.').toBe(
        newPhone,
      );
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
    async ({ trackedRecords, asPersona }) => {
      const created = await trackedRecords.create(SObjects.ACCOUNT, makeAccount());

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
    },
  );
});

test.describe('Account list view', () => {
  test(
    'a hierarchy created in one composite call is listable',
    { tag: '@sanity' },
    async ({ page, listView: makeListView, trackedRecords }) => {
      // composite/tree creates the Account AND its Contacts in a single request (~200 ms).
      // createTree asserts hasErrors internally — the outer 200 lies when subrecords fail.
      //
      // Contacts cascade-delete with their master Account, but the tracker registers every created
      // id anyway: cascade applies to master-detail, NOT to lookup children, so assuming it is how
      // orphans accumulate. Verify cascade behaviour for your own objects — see `salesforce-data`.
      const draft = makeAccountTree(2);
      const tree = await trackedRecords.createTree(SObjects.ACCOUNT, draft.records);
      const accountId = treeId(tree, 'acct1');

      const listView = makeListView(SObjects.ACCOUNT);

      const listed = waitForListRecords(page);
      await listView.goto();
      await listed;

      // ⚠️ Assert the ROW, not the table. `table.toBeVisible()` passes for an EMPTY list view — it
      // proves the page rendered, not that the record is listable, which is what the test claims.
      // Scope to the row so a create that silently failed cannot pass here.
      await expect(
        listView.row(draft.account.Name),
        `The Account created via composite/tree (${accountId}) should appear in the list view.`,
      ).toBeVisible();
    },
  );
});
