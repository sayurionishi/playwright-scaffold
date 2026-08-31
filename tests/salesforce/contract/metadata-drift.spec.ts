import { test, expect } from '../../../fixtures/test-options';
import { SalesforceApi } from '../../../enums/salesforce/salesforce-api';
import { SObjects } from '../../../enums/salesforce/sobjects';
import { salesforceConfig } from '../../../config/salesforce.config';
import { VersionListSchema } from '../../../fixtures/salesforce/schemas/salesforce-common.schema';
import type { ObjectSnapshot } from '../../../fixtures/salesforce/schemas/describe.schema';
import {
  fetchDescribe,
  normalizeDescribe,
  diffSnapshots,
} from '../../../helpers/salesforce/describe';

/**
 * EXAMPLE metadata-contract tests. Runs in the `org` project (no browser).
 *
 * WHY THESE MATTER MOST: Salesforce metadata changes when an admin clicks Save — no deploy, no PR,
 * no notification. Without these tests, an admin marking a field required surfaces tomorrow as
 * forty failing UI tests and three hours of debugging that looks like a Playwright problem. With
 * them, it's ONE failing test that names the field.
 *
 * See the `salesforce-metadata-contract` skill. Tag: @contract.
 */
test.describe('Salesforce API version', () => {
  test(
    'the pinned API version is still supported by the org',
    { tag: '@contract' },
    async ({ adminOrg }) => {
      const { data } = await adminOrg.get(SalesforceApi.VERSIONS, {
        schema: VersionListSchema,
        expectStatus: 200,
      });

      // Salesforce retires old versions. A stale pin otherwise shows up as every request 404ing
      // with no explanation — this fails with an actionable message instead.
      expect(
        data.map((version) => `v${version.version}`),
        `Pinned SF_API_VERSION=${salesforceConfig.apiVersion} is not in the org's supported list. ` +
          'Bump it, then re-run `npm run sf:schemas` and review the diff.',
      ).toContain(salesforceConfig.apiVersion);
    },
  );
});

test.describe('Object metadata drift', () => {
  /**
   * The drift test, written generically so adding an object is one array entry.
   *
   * ⚠️ THIS SPEC IS INERT UNTIL YOU GENERATE SCHEMAS. Run:
   *     npm run sf:schemas -- Account Contact Opportunity
   * then import the generated snapshot map and add it to the list below. We deliberately ship no
   * committed snapshot: a snapshot is org-specific, and inventing one would violate rule #15.
   *
   * `snapshotByEnv` is keyed by ENVIRONMENT ('dev', 'staging', …) because dev and staging sandboxes
   * routinely have genuinely different metadata shapes — an unrefreshed sandbox, a field that
   * landed in dev but hasn't been deployed to staging yet. One snapshot per environment means
   * running this against a different org never produces a false failure for a difference that was
   * never real drift. See `docs/salesforce/TEST-ARCHITECTURE.md` §"Multi-environment".
   */
  const OBJECTS_UNDER_CONTRACT: Array<{
    name: string;
    snapshotByEnv: Partial<Record<string, ObjectSnapshot>>;
  }> = [
    // { name: SObjects.ACCOUNT, snapshotByEnv: AccountSnapshotByEnv },   ← after running sf:schemas
  ];

  test(
    'metadata snapshots exist for the objects the suite depends on',
    { tag: '@contract' },
    async () => {
      // A guard, not a real assertion: it makes "you never generated schemas" a clear failure
      // rather than a silently-empty test run that looks green.
      expect(
        OBJECTS_UNDER_CONTRACT.length,
        'No committed metadata snapshots. Run `npm run sf:schemas -- Account Contact Opportunity`, ' +
          'then register the generated snapshots in OBJECTS_UNDER_CONTRACT above. ' +
          'See the `salesforce-metadata-contract` skill.',
      ).toBeGreaterThan(0);
    },
  );

  /**
   * The branch on "does a snapshot exist for this environment" happens HERE, at collection time —
   * not inside a test body. `salesforceConfig.environment` is already resolved (dotenv loaded
   * before any spec file is collected) and `snapshotByEnv` is a plain statically-imported object,
   * so which of the two tests below gets registered is knowable up front. That keeps `--list`
   * honest about real coverage and avoids a runtime conditional/conditional-expect in the test body.
   */
  for (const target of OBJECTS_UNDER_CONTRACT) {
    const expected = target.snapshotByEnv[salesforceConfig.environment];

    if (expected === undefined) {
      test(
        `${target.name} has no committed snapshot for "${salesforceConfig.environment}"`,
        { tag: '@contract' },
        () => {
          // An unconditional expect(), not a bare throw — a real assertion, so the failure reads
          // like every other contract failure in this file rather than an uncaught exception.
          expect(
            false,
            `No committed snapshot for ${target.name} in environment "${salesforceConfig.environment}". ` +
              `Generate one: ENVIRONMENT=${salesforceConfig.environment} npm run sf:schemas -- ${target.name}`,
          ).toBe(true);
        },
      );

      continue;
    }

    test(
      `${target.name} metadata matches the committed snapshot for ${salesforceConfig.environment}`,
      { tag: '@contract' },
      async ({ adminOrg }) => {
        const live = normalizeDescribe(await fetchDescribe(adminOrg, target.name));

        // diffSnapshots so a failure names WHAT changed instead of dumping two large objects.
        const differences = diffSnapshots(expected, live);
        expect(
          differences,
          `${target.name} metadata drifted in "${salesforceConfig.environment}":\n  ` +
            `${differences.join('\n  ')}\n\n` +
            'Triage per the `salesforce-metadata-contract` skill. If the change was intended, ' +
            're-run `npm run sf:schemas` and review the diff like code. NEVER hand-edit the ' +
            'generated snapshot to make this pass.',
        ).toEqual([]);
      },
    );
  }
});

test.describe('Metadata endpoint envelope', () => {
  test(
    'Account metadata returns the documented describe shape',
    { tag: '@contract' },
    async ({ adminOrg }) => {
      // Account is a standard object present in every org, so this is safe without generation —
      // it validates the describe ENVELOPE, which is what the generator depends on.
      const describe = await fetchDescribe(adminOrg, SObjects.ACCOUNT);

      expect(describe.name).toBe(SObjects.ACCOUNT);
      expect(describe.keyPrefix).toBe('001');
      expect(describe.queryable).toBe(true);
      expect(describe.fields.length).toBeGreaterThan(0);

      // Every org has Account.Name; its absence would mean we're not looking at what we think.
      expect(describe.fields.map((field) => field.name)).toContain('Name');
    },
  );
});
