import { test, expect } from '../../fixtures/test-options';
import { SObjects, SalesforceErrorCodes } from '../../enums/salesforce/sobjects';
import { Personas } from '../../test-data/salesforce/personas';
import { fetchObjectInfo } from '../../helpers/salesforce/describe';
import { SalesforceApi } from '../../enums/salesforce/salesforce-api';
import { SalesforceErrorListSchema } from '../../fixtures/salesforce/schemas/salesforce-common.schema';

/**
 * EXAMPLE persona / FLS matrix. Runs in the `api` or `org` project — no browser.
 *
 * WHY AT THE API LAYER: dozens of persona × field combinations run in seconds here. The same
 * coverage through the UI would take twenty minutes and import every Lightning flake. Write a
 * SMALL number of UI tests only where the *screen* is the risk.
 *
 * See the `salesforce-personas` skill. Tag: @persona.
 */

test.describe('Object-level access by persona', () => {
  /**
   * ⚠️ These expectations describe the EXAMPLE personas in test-data/salesforce/personas.ts.
   * Replace them with your org's real permission model during bootstrap — and read the truth from
   * the org rather than assuming it, since a permission set can grant what a profile denies.
   */
  const OBJECT_ACCESS = [
    { persona: Personas.admin.key, object: SObjects.ACCOUNT, createable: true },
    { persona: Personas.readOnly.key, object: SObjects.ACCOUNT, createable: false },
  ] as const;

  for (const row of OBJECT_ACCESS) {
    test(
      `${row.persona} createable=${row.createable} on ${row.object}`,
      { tag: '@persona' },
      async ({ orgAs }) => {
        const org = await orgAs(row.persona);

        // object-info, NOT describe: this endpoint is calling-user aware and resolves
        // profile + permission sets + muting as actually applied.
        const info = await fetchObjectInfo(org, row.object);
        expect(info.createable).toBe(row.createable);
      },
    );
  }
});

test.describe('Field-level security', () => {
  /**
   * THE CENTRAL RULE OF THIS FILE: an absence assertion needs a positive control.
   *
   * `expect(field).toBeUndefined()` passes when the field is hidden — and ALSO when you typo'd the
   * field name, when the request failed, and when you're looking at the wrong object. In a
   * permissions suite that false green reads as "this is locked down" when it isn't.
   *
   * So each restricted field is asserted TWICE: visible for the persona that should see it (proving
   * the field name and the request are right), hidden for the persona that shouldn't.
   *
   * ⚠️ Fill FIELD_ACCESS in with a REAL restricted field from your org — read the API name from
   * `describe`, never write it from memory (Constitution #15). We ship it empty rather than invent
   * a `Margin__c` that doesn't exist in your org.
   */
  const FIELD_ACCESS: Array<{
    field: string;
    visibleTo: string;
    hiddenFrom: string;
  }> = [
    // { field: 'YourRestricted__c', visibleTo: Personas.salesManager.key, hiddenFrom: Personas.salesRep.key },
  ];

  test('a restricted field is configured for this suite', { tag: '@persona' }, async () => {
    expect(
      FIELD_ACCESS.length,
      'No FLS pairs configured. Add at least one restricted field (API name from `describe`) to ' +
        'FIELD_ACCESS above. See the `salesforce-personas` skill.',
    ).toBeGreaterThan(0);
  });

  for (const row of FIELD_ACCESS) {
    // POSITIVE CONTROL — proves the field name and the request path are correct.
    test(`${row.visibleTo} CAN see ${row.field}`, { tag: '@persona' }, async ({ orgAs }) => {
      const org = await orgAs(row.visibleTo);
      const info = await fetchObjectInfo(org, SObjects.OPPORTUNITY);
      expect(
        info.fields[row.field],
        `Positive control failed: ${row.visibleTo} should see ${row.field}. If this fails, the ` +
          'paired negative test below is meaningless — fix this one first.',
      ).toBeDefined();
    });

    // The actual restriction. Only meaningful because the test above passes.
    test(`${row.hiddenFrom} CANNOT see ${row.field}`, { tag: '@persona' }, async ({ orgAs }) => {
      const org = await orgAs(row.hiddenFrom);
      const info = await fetchObjectInfo(org, SObjects.OPPORTUNITY);
      // A field the caller lacks access to is ABSENT from the object-info map entirely.
      expect(info.fields[row.field]).toBeUndefined();
    });
  }
});

test.describe('Denial surfaces as the documented status code', () => {
  test(
    'a record the persona cannot access returns 404, not 403',
    { tag: '@persona' },
    async ({ orgAs }) => {
      const org = await orgAs(Personas.readOnly.key);

      // A syntactically valid Account Id that does not exist. Salesforce deliberately returns 404
      // for "no sharing access" too — it hides existence so record Ids can't be probed. So this
      // asserts the SHAPE of denial; it cannot distinguish the two cases, by design.
      const unreachableId = '001000000000000AAA';
      const response = await org.get(SalesforceApi.sobjectById(SObjects.ACCOUNT, unreachableId), {
        schema: SalesforceErrorListSchema,
      });

      expect(response.status).toBe(404);
      expect(response.data[0]?.errorCode).toBe(SalesforceErrorCodes.NOT_FOUND);
    },
  );
});
