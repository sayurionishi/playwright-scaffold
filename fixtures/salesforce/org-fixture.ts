import { test as base, request as playwrightRequest } from '@playwright/test';
import { ApiRequest } from '../api/api-request';
import { getOrgSession, authHeaders, type OrgSession } from '../../helpers/salesforce/auth';
import { salesforceConfig } from '../../config/salesforce.config';
import { Personas, assertAssertable, type Persona } from '../../test-data/salesforce/personas';

/**
 * Salesforce org API fixtures.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * TWO CLIENTS, TWO JOBS. Using the wrong one is the most consequential mistake in this pack.
 *
 *   `adminOrg`  ARRANGE + TEARDOWN. System Admin. Creates and deletes records. Modify All Data,
 *               so cleanup is never blocked by FLS or sharing.
 *               ⚠️ NEVER assert a permission-sensitive fact with this client. Modify All Data
 *               bypasses sharing AND field-level security, so the test passes even when the
 *               permission model is completely broken.
 *
 *   `org`       ACT + ASSERT. The persona under test (SF_DEFAULT_PERSONA — a restricted user, not
 *               an admin). This is the client whose view of the org you are actually testing.
 *
 *   `orgAs(k)`  ACT + ASSERT as a specific persona. The workhorse of the permission matrix.
 *               Refuses privileged personas (see `assertAssertable`).
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * These are LAZY — a Playwright fixture only runs when a test destructures it — so a
 * non-Salesforce clone can keep this file merged into test-options without any SF_* var set.
 */
export interface SalesforceOrgFixtures {
  /** The subject persona's session. */
  orgSession: OrgSession;
  /**
   * ARRANGE/TEARDOWN client (System Admin). Create and delete records with this.
   * Do NOT assert permissions with it — it bypasses the very rules under test.
   */
  adminOrg: ApiRequest;
  /** ACT/ASSERT client — the persona under test. */
  org: ApiRequest;
  /**
   * ACT/ASSERT client for a SPECIFIC persona. Throws for a privileged persona, because an admin
   * subject makes a permission assertion meaningless.
   */
  orgAs: (personaKey: string) => Promise<ApiRequest>;
  /** The persona metadata for the current subject — handy in test titles and messages. */
  subjectPersona: Persona;
}

/** Emit the privileged-subject warning once per process, not once per test. */
let privilegedSubjectWarned = false;

/**
 * Warn when the SUBJECT persona is privileged.
 *
 * `orgAs()` throws for a privileged persona, but the `org`/`page` path can't: someone may
 * legitimately be running a single-identity local setup, or deliberately testing the admin's own
 * screen. So this warns rather than blocks — but it MUST warn, because a privileged subject silently
 * voids every assertion made with it (Modify All Data bypasses sharing and FLS), and the suite still
 * goes green. A silent pass is the one outcome worse than a failure.
 */
function warnIfSubjectIsPrivileged(): void {
  if (privilegedSubjectWarned) return;
  const subject = lookupPersona(salesforceConfig.defaultPersona);
  if (!subject.privileged) return;
  privilegedSubjectWarned = true;
  console.warn(
    `⚠️  SF_DEFAULT_PERSONA="${subject.key}" is PRIVILEGED. Every assertion made with \`org\` or the ` +
      'UI `page` now runs with Modify All Data, which bypasses sharing AND field-level security — ' +
      'so permission tests will pass no matter how broken the org is, and UI tests exercise a screen ' +
      'no real user sees. Set SF_DEFAULT_PERSONA to a restricted persona (e.g. standardUser).',
  );
}

function lookupPersona(personaKey: string): Persona {
  const found = Object.values(Personas).find((p) => p.key === personaKey);
  if (found === undefined) {
    throw new Error(
      `Unknown persona "${personaKey}". Add it to test-data/salesforce/personas.ts ` +
        `(known: ${Object.keys(Personas).join(', ')}).`,
    );
  }
  return found;
}

export const test = base.extend<SalesforceOrgFixtures>({
  // `{}` is required, not a style choice: Playwright inspects the destructuring pattern to work out
  // a fixture's dependencies, and rejects a plain parameter name. `no-empty-pattern` is disabled
  // for fixtures/** in eslint.config.mjs for exactly this reason.
  orgSession: async ({}, use) => {
    warnIfSubjectIsPrivileged();
    await use(await getOrgSession(salesforceConfig.defaultPersona));
  },

  subjectPersona: async ({}, use) => {
    warnIfSubjectIsPrivileged();
    await use(lookupPersona(salesforceConfig.defaultPersona));
  },

  adminOrg: async ({}, use) => {
    const adminKey = salesforceConfig.adminPersona;
    const adminPersona = lookupPersona(adminKey);

    // Catch a misconfigured SF_ADMIN_PERSONA early. Arranging as a restricted identity fails in
    // the most annoying way possible: teardown silently can't delete, and data leaks for weeks.
    if (!adminPersona.privileged) {
      throw new Error(
        `SF_ADMIN_PERSONA="${adminKey}" is not marked privileged in personas.ts. The arrange/teardown ` +
          'identity needs Modify All Data so cleanup is never blocked by FLS or sharing. ' +
          'See `salesforce-personas`.',
      );
    }

    const session = await getOrgSession(adminKey);
    const context = await playwrightRequest.newContext({
      baseURL: session.instanceUrl,
      extraHTTPHeaders: authHeaders(session),
    });
    await use(new ApiRequest(context, session.instanceUrl));
    await context.dispose();
  },

  org: async ({ orgSession }, use) => {
    const context = await playwrightRequest.newContext({
      baseURL: orgSession.instanceUrl,
      extraHTTPHeaders: authHeaders(orgSession),
    });
    await use(new ApiRequest(context, orgSession.instanceUrl));
    await context.dispose();
  },

  orgAs: async ({}, use) => {
    // Track every context we hand out so teardown disposes all of them.
    const created: Array<{ dispose: () => Promise<void> }> = [];

    await use(async (personaKey: string) => {
      // Refuse a privileged subject — an admin client would pass any permission assertion.
      assertAssertable(lookupPersona(personaKey));

      const session = await getOrgSession(personaKey);
      const context = await playwrightRequest.newContext({
        baseURL: session.instanceUrl,
        extraHTTPHeaders: authHeaders(session),
      });
      created.push(context);
      return new ApiRequest(context, session.instanceUrl);
    });

    for (const context of created) {
      await context.dispose();
    }
  },
});
