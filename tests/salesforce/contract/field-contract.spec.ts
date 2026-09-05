import { test, expect } from '../../../fixtures/test-options';
import { ALL_CONTRACTS } from '../../../test-data/salesforce/contracts/account.contract';
import { fetchDescribe } from '../../../helpers/salesforce/describe';
import { assertObjectShape } from '../../../helpers/salesforce/contract';

/**
 * SHAPE contract — field types, lengths, nillable, picklist values, reference targets, record types.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS LAYER EXISTS AND WHAT IT REPLACES
 *
 * Every assertion here is one a UI test COULD make — and shouldn't. "The Stage picklist offers
 * these six values" through the browser costs ~20 seconds, needs a logged-in session, breaks when
 * a locator changes, and tells you nothing about the other 40 fields. The same assertion here costs
 * one API call, covers every field at once, and fails with the field name in the message.
 *
 * So this is where field-level truth is asserted. UI tests then get to be about BEHAVIOUR —
 * see docs/salesforce/TEST-ARCHITECTURE.md.
 *
 * Runs in the `org` project: no browser, no storageState.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Uses `adminOrg` deliberately: shape is an ORG-WIDE fact, so it must be read by an identity that
 * isn't filtered by FLS. Persona-specific truth lives in permissions.spec.ts.
 */
test.describe('Field shape contract', () => {
  for (const contract of ALL_CONTRACTS) {
    test(
      `${contract.object} field shapes match the contract`,
      { tag: '@contract' },
      async ({ adminOrg }) => {
        // adminOrg, not org: `describe` read as a restricted persona omits fields that persona
        // cannot see, which would look like fields being deleted from the org.
        const describe = await fetchDescribe(adminOrg, contract.object);

        // Soft assertions inside — one run reports EVERY drifted field. Fixing 12 fields across
        // 12 red runs is how teams start ignoring contract tests.
        assertObjectShape(describe, contract);
      },
    );
  }

  test('at least one object contract is registered', { tag: '@contract' }, async () => {
    // A guard, not a behaviour test: makes "nobody wrote a contract" a clear failure rather than a
    // vacuously green run with zero generated tests.
    expect(
      ALL_CONTRACTS.length,
      'No object contracts registered. Add one to test-data/salesforce/contracts/ and list it in ' +
        'ALL_CONTRACTS. See the `salesforce-metadata-contract` skill.',
    ).toBeGreaterThan(0);
  });
});
