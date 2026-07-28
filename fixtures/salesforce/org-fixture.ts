import { test as base, request as playwrightRequest } from '@playwright/test';
import { ApiRequest } from '../api/api-request';
import { getOrgSession, authHeaders, type OrgSession } from '../../helpers/salesforce/auth';
import { salesforceConfig } from '../../config/salesforce.config';

/**
 * Salesforce org API fixtures.
 *
 * These are LAZY — a Playwright fixture only runs when a test destructures it. So a non-Salesforce
 * clone can keep this file merged into test-options without needing any SF_* env var set. The
 * config getters only throw when a test actually asks for an org client.
 *
 * `org` is an `ApiRequest` (same typed, Zod-validating client the rest of the scaffold uses) bound
 * to the org's INSTANCE url with the session's bearer token. Note the instance host differs from
 * BASE_URL, which for Salesforce is the Lightning host — see `salesforce-auth`.
 */
export interface SalesforceOrgFixtures {
  /** The default persona's session (from SF_DEFAULT_PERSONA). */
  orgSession: OrgSession;
  /** API client for the default persona. */
  org: ApiRequest;
  /**
   * API client for a SPECIFIC persona — the workhorse of the permission matrix.
   * Clients are created per test and disposed on teardown, never shared across personas.
   */
  orgAs: (personaKey: string) => Promise<ApiRequest>;
}

export const test = base.extend<SalesforceOrgFixtures>({
  // `{}` is required, not a style choice: Playwright inspects the destructuring pattern to work out
  // a fixture's dependencies, and rejects a plain parameter name. `no-empty-pattern` is disabled
  // for fixtures/** in eslint.config.mjs for exactly this reason.
  orgSession: async ({}, use) => {
    await use(await getOrgSession(salesforceConfig.defaultPersona));
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
