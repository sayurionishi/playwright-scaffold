import { test, expect } from '../../../fixtures/test-options';
import {
  ALL_CONTRACTS,
  PersonaGrants,
} from '../../../test-data/salesforce/contracts/account.contract';
import { Personas, ASSERTABLE_PERSONAS } from '../../../test-data/salesforce/personas';
import { salesforceConfig } from '../../../config/salesforce.config';
import { fetchObjectInfo } from '../../../helpers/salesforce/describe';
import {
  assertObjectCrud,
  assertFieldAccess,
  assertVisibleFieldSet,
} from '../../../helpers/salesforce/contract';
import {
  assignedPermissionSets,
  objectPermissionsFor,
  requireUserByUsername,
} from '../../../helpers/salesforce/permissions';
import { SalesforceApi } from '../../../enums/salesforce/salesforce-api';
import { SObjects, SalesforceErrorCodes } from '../../../enums/salesforce/sobjects';
import { SalesforceErrorListSchema } from '../../../fixtures/salesforce/schemas/salesforce-common.schema';

/**
 * PERMISSION contract — grants, object CRUD, field-level security, and the visible-field set.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * THE WHOLE PERMISSION MODEL IS ASSERTED HERE, NOT IN THE UI.
 *
 * A persona × field matrix at this layer runs in seconds with no browser. The same coverage through
 * Lightning would take twenty minutes and inherit every rendering flake — and UI absence is
 * ambiguous anyway (FLS? page layout? record type? collapsed section?). The API tells you WHICH.
 *
 * UI tests then verify only that the screen HONOURS this model, in the one or two places where
 * rendering is genuinely the risk. See docs/salesforce/TEST-ARCHITECTURE.md.
 *
 * NOTE ON STRUCTURE: every branch is taken at COLLECTION time, not inside a test body. The contract
 * is static data, so which tests exist can be decided up front — which means `--list` shows your
 * real coverage instead of hiding it behind runtime `if`s.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Runs in the `org` project (no browser). Tag: @persona.
 */

test.describe('Permission set grants', () => {
  /**
   * Assert the GRANT, not just its effect.
   *
   * `object-info` tells you a persona can't edit a field; it doesn't tell you why. When an admin
   * unassigns a permission set, six FLS tests go red for a reason that looks unrelated. Asserting
   * the assignment directly turns that into one clear failure naming the set. Permission drift IS
   * contract drift — it happens with no deploy and no notification.
   */
  for (const grant of PersonaGrants) {
    test(
      `${grant.personaKey} holds exactly the expected permission sets`,
      { tag: '@persona' },
      async ({ adminOrg }) => {
        // requireUserByUsername throws on missing/inactive, so no conditional is needed here.
        const user = await requireUserByUsername(
          adminOrg,
          salesforceConfig.username(grant.personaKey),
        );

        const assigned = await assignedPermissionSets(adminOrg, user.id);
        const expectedSets = [...grant.permissionSets].sort();

        // `exact` because an EXTRA permission set is a privilege escalation — the more dangerous
        // direction, and the one a "must contain" check misses entirely.
        expect(
          assigned,
          `Permission set assignments for ${grant.personaKey} drifted. An EXTRA set is a privilege ` +
            'escalation; a MISSING set will break downstream FLS tests for a reason that looks ' +
            'unrelated.',
        ).toEqual(grant.exact ? expectedSets : expect.arrayContaining(expectedSets));
      },
    );
  }

  // Profile is asserted as its own test only for personas that declare one — a collection-time
  // decision, so the test list shows exactly which personas have a pinned profile.
  for (const grant of PersonaGrants.filter((g) => g.profile !== undefined)) {
    test(
      `${grant.personaKey} has the expected profile`,
      { tag: '@persona' },
      async ({ adminOrg }) => {
        const user = await requireUserByUsername(
          adminOrg,
          salesforceConfig.username(grant.personaKey),
        );
        expect(user.profileName, `Profile for ${grant.personaKey} changed.`).toBe(grant.profile);
      },
    );
  }

  // Role drives SHARING, so it only matters for the hierarchy personas — and a changed role
  // silently changes which RECORDS the persona sees, with no FLS or CRUD change to hint at it.
  for (const grant of PersonaGrants.filter((g) => g.role !== undefined)) {
    test(`${grant.personaKey} has the expected role`, { tag: '@persona' }, async ({ adminOrg }) => {
      const user = await requireUserByUsername(
        adminOrg,
        salesforceConfig.username(grant.personaKey),
      );
      expect(
        user.roleName,
        `Role for ${grant.personaKey} changed — this alters record visibility via the hierarchy ` +
          'without touching CRUD or FLS, so nothing else in this suite would catch it.',
      ).toBe(grant.role);
    });
  }
});

test.describe('No unintended sharing bypass', () => {
  /**
   * "View All Records" / "Modify All Records" on a non-admin persona is a silent, total bypass of
   * the sharing model. Every sharing test still passes — the persona simply sees everything.
   *
   * This is the highest-severity permission misconfiguration in Salesforce, and almost nobody tests
   * for it. Only personas that actually hold permission sets are checked (collection-time filter).
   */
  const personasWithGrants = ASSERTABLE_PERSONAS.filter((p) => p.permissionSets.length > 0);

  for (const contract of ALL_CONTRACTS) {
    for (const persona of personasWithGrants) {
      test(
        `${contract.object}: ${persona.key} has no ViewAll/ModifyAll`,
        { tag: '@persona' },
        async ({ adminOrg }) => {
          const grants = await objectPermissionsFor(
            adminOrg,
            contract.object,
            persona.permissionSets,
          );

          // Soft so a persona holding several sets reports every offending one in a single run.
          for (const grant of grants) {
            expect
              .soft(
                grant.viewAll,
                `Permission set "${grant.source}" grants View All Records on ${contract.object} to ` +
                  `non-admin persona "${persona.key}" — this bypasses the sharing model entirely.`,
              )
              .toBe(false);
            expect
              .soft(
                grant.modifyAll,
                `Permission set "${grant.source}" grants Modify All Records on ${contract.object} ` +
                  `to non-admin persona "${persona.key}" — total sharing AND FLS bypass.`,
              )
              .toBe(false);
          }
        },
      );
    }
  }
});

test.describe('Object-level CRUD by persona', () => {
  for (const contract of ALL_CONTRACTS) {
    const crudEntries = Object.entries(contract.crudByPersona);

    // Personas WITH access: assert the CRUD flags from object-info.
    for (const [personaKey, expected] of crudEntries.filter(([, e]) => e.queryable)) {
      test(`${contract.object} CRUD for ${personaKey}`, { tag: '@persona' }, async ({ orgAs }) => {
        // orgAs refuses a privileged persona — an admin client would pass regardless of config.
        const org = await orgAs(personaKey);
        const info = await fetchObjectInfo(org, contract.object);
        assertObjectCrud(info, personaKey, expected);
      });
    }

    // Personas with NO access: the object-info request itself must fail. Split into its own test
    // rather than an `if` inside the one above, so the deny case is visible in the test list.
    for (const [personaKey] of crudEntries.filter(([, e]) => !e.queryable)) {
      test(
        `${contract.object} is inaccessible to ${personaKey}`,
        { tag: '@persona' },
        async ({ orgAs }) => {
          const org = await orgAs(personaKey);
          const response = await org.get(SalesforceApi.objectInfo(contract.object));
          expect(
            response.status,
            `Persona "${personaKey}" should have NO access to ${contract.object}, but object-info ` +
              `returned ${response.status}. If this persona can read metadata, every "cannot ` +
              'access" assertion in this suite may be passing vacuously.',
          ).toBeGreaterThanOrEqual(400);
        },
      );
    }
  }
});

test.describe('Field-level security by persona', () => {
  for (const contract of ALL_CONTRACTS) {
    for (const [personaKey, fieldMap] of Object.entries(contract.fieldAccessByPersona)) {
      test(
        `${contract.object} field access for ${personaKey}`,
        { tag: '@persona' },
        async ({ orgAs }) => {
          const org = await orgAs(personaKey);
          const info = await fetchObjectInfo(org, contract.object);

          // Soft, so one run reports every field — all of them, not just the first to drift.
          for (const [fieldName, expected] of Object.entries(fieldMap)) {
            assertFieldAccess(info, personaKey, fieldName, expected);
          }
        },
      );
    }
  }
});

test.describe('Visible-field set (leak detection)', () => {
  /**
   * The strongest assertion in the pack — see `assertVisibleFieldSet`.
   *
   * The field-by-field tests above only cover fields someone thought to list. When an admin adds a
   * field that defaults to visible for every profile, none of them fail — nobody asked about it.
   * This exact-set comparison fails on it immediately, and reports "newly visible" separately
   * because that is the leak direction.
   *
   * Populate the sets with `npm run sf:visible-fields` and commit the output.
   */
  for (const contract of ALL_CONTRACTS) {
    for (const [personaKey, expectedFields] of Object.entries(
      contract.visibleFieldsByPersona ?? {},
    )) {
      test(
        `${contract.object} visible fields for ${personaKey} are exactly as committed`,
        { tag: '@persona' },
        async ({ orgAs }) => {
          const org = await orgAs(personaKey);
          const info = await fetchObjectInfo(org, contract.object);
          assertVisibleFieldSet(info, personaKey, expectedFields);
        },
      );
    }
  }
});

test.describe('Denial boundary', () => {
  /**
   * The `noAccess` persona exists to prove the deny path can actually fail.
   *
   * Without it, a suite full of "restricted user cannot X" assertions may be passing vacuously —
   * wrong locator, failed request, wrong object. This is the hard floor.
   */
  test('noAccess persona is refused object metadata', { tag: '@persona' }, async ({ orgAs }) => {
    const org = await orgAs(Personas.noAccess.key);
    const response = await org.get(SalesforceApi.objectInfo(SObjects.ACCOUNT));
    expect(
      response.status,
      'The noAccess persona could read Account metadata. Either the persona is misconfigured, or ' +
        'every "cannot access" assertion in this suite is passing vacuously.',
    ).toBeGreaterThanOrEqual(400);
  });

  test(
    'a record outside the persona sharing scope returns 404, not 403',
    { tag: '@persona' },
    async ({ orgAs }) => {
      const org = await orgAs(Personas.readOnly.key);

      // A syntactically valid Account Id that does not exist. Salesforce returns 404 for "no
      // sharing access" too — it hides existence so Ids cannot be probed. So this asserts the SHAPE
      // of denial; it cannot distinguish the two cases, by design.
      const unreachableId = '001000000000000AAA';
      const response = await org.get(SalesforceApi.sobjectById(SObjects.ACCOUNT, unreachableId), {
        schema: SalesforceErrorListSchema,
      });

      expect(response.status).toBe(404);
      expect(response.data[0]?.errorCode).toBe(SalesforceErrorCodes.NOT_FOUND);
    },
  );

  /**
   * An API-only integration identity must not be able to use the browser UI. Integration users
   * often carry broad API grants nobody audits, so "it can't also log in" is a real security
   * assertion — and this guards the persona definition itself, since flipping `uiCapable` to true
   * would silently mint a browser session for it.
   */
  test('the integration persona has no UI-capable licence', { tag: '@persona' }, async () => {
    expect(
      Personas.integrationUser.uiCapable,
      'integrationUser is marked uiCapable — the setup fan-out will mint a browser storageState ' +
        'for it. An API-only identity should not have UI access.',
    ).toBe(false);
  });
});
