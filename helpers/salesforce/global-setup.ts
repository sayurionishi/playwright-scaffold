import { request as playwrightRequest } from '@playwright/test';
import { ApiRequest } from '@fixtures/api/api-request';
import { getOrgSession, authHeaders } from './auth';
import { assertApiLimitHeadroom } from './soql';
import { salesforceConfig } from '@config/salesforce.config';

/**
 * Playwright `globalSetup` — the org API-limit pre-flight.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────────────────────────
 *
 * `assertApiLimitHeadroom` existed, was documented in three places as a guarantee
 * (`config/salesforce.config.ts`, `env/.env.salesforce.example`, the `salesforce-data` skill) —
 * and had ZERO callers. There was no `globalSetup`, so nothing ever invoked it. The promise that
 * a run aborts before burning the org's shared daily API budget was simply not wired up.
 *
 * It has to be global setup rather than a fixture: the point is to refuse to START a run, and a
 * fixture only runs once a test is already executing. Checking per test would also spend a request
 * per test to find out whether it can afford requests.
 *
 * ── WHY IT IS A SOFT NO-OP ────────────────────────────────────────────────────────────────────
 *
 * This runs for EVERY project, including on a non-Salesforce clone where no `SF_*` variable is
 * set. A global setup that throws there would make the whole suite unrunnable for people who
 * never asked for Salesforce, so an unconfigured org is a silent skip. That is the one place in
 * this scaffold where swallowing an error is right: the alternative is a generic project failing
 * on a Salesforce credential it has no reason to own.
 *
 * The limit itself is org-wide and shared with production integrations, so exhausting it takes
 * real integrations down and not just your tests. That is why this fails LOUDLY once configured.
 */
async function globalSetup(): Promise<void> {
  // No org configured → nothing to check. `authStrategy` reads env through getters, so this is
  // cheap and never throws.
  if (process.env.SF_LOGIN_URL === undefined || process.env.SF_LOGIN_URL === '') return;

  let context;
  try {
    const session = await getOrgSession(salesforceConfig.adminPersona);
    context = await playwrightRequest.newContext({
      baseURL: session.instanceUrl,
      extraHTTPHeaders: authHeaders(session),
    });
    // Deliberately NOT wrapped: if the org IS configured and it is out of headroom, the run must
    // stop. Only the *reachability* of the org is tolerated as unknown, below.
    await assertApiLimitHeadroom(new ApiRequest(context, session.instanceUrl));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The guard's own abort message is the one thing we must not swallow.
    if (message.startsWith('Aborting:')) throw error;
    console.warn(
      `⚠️  Skipped the Salesforce API-limit pre-flight: ${message}\n` +
        '   The run continues, because a credential or connectivity problem here is not itself a ' +
        'reason to fail every test — the auth setup project will report it properly. If you ' +
        'expected this check to run, verify SF_CLIENT_ID / SF_JWT_PRIVATE_KEY.',
    );
  } finally {
    await context?.dispose();
  }
}

export default globalSetup;
