import { test, expect } from '@fixtures/test-options';
import { fetchDescribe } from '@helpers/salesforce/describe';
import { ORG_SHAPE, ORG_SHAPE_IS_EMPTY } from '@test-data/salesforce/contracts/org-shape';

/**
 * ORG-SHAPE PRE-FLIGHT. Runs in the `org` project (no browser). Tag: @contract.
 *
 * The cheapest test in the suite and the one to run first: it asserts that the org is configured
 * the way every other test assumes. A sandbox refresh, a renamed record type, or a picklist value
 * an admin retired otherwise surfaces as dozens of unrelated-looking UI failures.
 *
 * Uses `adminOrg` deliberately: org shape is an org-wide fact. Reading it as a restricted persona
 * would omit what that persona cannot see, which looks identical to the config being absent.
 *
 * See `test-data/salesforce/contracts/org-shape.ts` for why it ships empty.
 */
test.describe('Org shape pre-flight', () => {
  /**
   * The guard, and note what it does NOT do.
   *
   * It would be easy to write `test.skip(ORG_SHAPE_IS_EMPTY, …)` here. That is a silent skip
   * (Constitution #13) and lint blocks it — correctly, because a skipped pre-flight is
   * indistinguishable from a passing one in the report.
   *
   * A guard that always failed while unpopulated would be worse: this project only runs when an
   * org is configured, but a scaffold that ships red teaches people to ignore red.
   *
   * So the condition is precise: an org IS wired up, and its shape was never declared. A
   * non-Salesforce clone never reaches this test at all, and a fresh Salesforce clone gets one
   * clear instruction instead of forty confusing UI failures later.
   */
  test('the org shape has been declared', { tag: '@contract' }, async () => {
    expect(
      ORG_SHAPE_IS_EMPTY,
      'An org is configured (SF_LOGIN_URL is set) but ORG_SHAPE is still empty, so nothing is ' +
        'pre-flighted and a sandbox refresh will surface as unrelated UI failures.\n' +
        '  Fix: populate test-data/salesforce/contracts/org-shape.ts with the record types and ' +
        'picklist values your tests depend on.\n' +
        '  Get the real values with: npm run sf:schemas -- Account Opportunity\n' +
        '  It ships empty deliberately — inventing a record-type name would violate ' +
        'Constitution #15, and a wrong default fails more confusingly than no default.',
    ).toBe(false);
  });

  for (const required of ORG_SHAPE.recordTypes) {
    test(
      `${required.object} has the "${required.developerName}" record type`,
      { tag: '@contract' },
      async ({ adminOrg }) => {
        const describe = await fetchDescribe(adminOrg, required.object);
        const available = describe.recordTypeInfos.map((info) => info.name);

        expect(
          available,
          `${required.object} is missing the "${required.developerName}" record type.\n` +
            `  Needed because: ${required.because}\n` +
            `  Record types present: ${available.join(', ') || '(none)'}\n` +
            '  A sandbox refresh wipes hand-made record types — recreate it, or update ORG_SHAPE ' +
            'if the org legitimately changed.',
        ).toContain(required.developerName);
      },
    );
  }

  for (const required of ORG_SHAPE.picklists) {
    test(
      `${required.object}.${required.field} still offers the values the suite uses`,
      { tag: '@contract' },
      async ({ adminOrg }) => {
        const describe = await fetchDescribe(adminOrg, required.object);
        const field = describe.fields.find((f) => f.name === required.field);

        // A hard failure, not soft: if the field is gone, every value assertion below is noise.
        expect(
          field,
          `${required.object}.${required.field} does not exist in this org. Either it was deleted, ` +
            'or the API name is wrong (Constitution #15 — read it from describe, not memory).',
        ).toBeDefined();

        const active = (field?.picklistValues ?? [])
          .filter((value) => value.active)
          .map((value) => value.value);

        // Soft so one run reports every missing value rather than stopping at the first.
        for (const value of required.values) {
          expect
            .soft(
              active,
              `${required.object}.${required.field} no longer offers "${value}".\n` +
                `  Needed because: ${required.because}\n` +
                `  Active values: ${active.join(', ') || '(none)'}\n` +
                '  An admin can retire a picklist value with no deploy and no notification.',
            )
            .toContain(value);
        }
      },
    );
  }
});
