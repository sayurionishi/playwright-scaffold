/**
 * Print the EXACT set of fields each persona can see, ready to paste into an object contract's
 * `visibleFieldsByPersona`.
 *
 *   npm run sf:visible-fields -- Account Opportunity
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Field-by-field FLS assertions only cover fields you thought to list. When an admin adds
 * `Commission_Rate__c` next quarter and it defaults to visible for every profile, nothing fails —
 * nobody asked about that field. That is precisely how field-level data leaks reach production.
 *
 * An exact-set assertion inverts the default: a NEW field visible to a restricted persona fails
 * immediately. This script generates those sets from the live org so the lists are real rather than
 * guessed (Constitution #15).
 *
 * It reads `ui-api/object-info` once PER PERSONA, because that endpoint is calling-user aware —
 * which is the entire point. `describe` would return the same org-wide answer every time.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import path from 'node:path';
import dotenv from 'dotenv';
import { request as playwrightRequest } from '@playwright/test';
import { ApiRequest } from '../fixtures/api/api-request';
import { getOrgSession, authHeaders } from '../helpers/salesforce/auth';
import { fetchObjectInfo, visibleFieldNames } from '../helpers/salesforce/describe';
import { ASSERTABLE_PERSONAS } from '../test-data/salesforce/personas';
import { salesforceConfig } from '../config/salesforce.config';

const ENVIRONMENT = process.env.ENVIRONMENT ?? 'dev';
dotenv.config({ path: path.resolve(process.cwd(), `env/.env.${ENVIRONMENT}`) });

async function clientFor(
  personaKey: string,
): Promise<{ org: ApiRequest; dispose: () => Promise<void> }> {
  const session = await getOrgSession(personaKey);
  const context = await playwrightRequest.newContext({
    baseURL: session.instanceUrl,
    extraHTTPHeaders: authHeaders(session),
  });
  return {
    org: new ApiRequest(context, session.instanceUrl),
    dispose: () => context.dispose(),
  };
}

async function main(): Promise<void> {
  const objectNames = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  if (objectNames.length === 0) {
    console.error(
      'Usage: npm run sf:visible-fields -- <Object> [<Object>...]\n' +
        'Example: npm run sf:visible-fields -- Account Opportunity',
    );
    process.exit(1);
  }

  /**
   * Require `jwt` up front rather than failing per persona.
   *
   * This script reads object-info once PER PERSONA, so it needs genuinely distinct identities. Under
   * `sfdx` (one CLI session) every non-admin persona would throw, get swallowed by the per-persona
   * catch below, and be printed as `// <persona>: no access` — a CONFIG failure rendered as a
   * PERMISSION result. Someone would then commit those empty sets as the contract.
   */
  if (salesforceConfig.authStrategy !== 'jwt') {
    console.error(
      `SF_AUTH_STRATEGY is "${salesforceConfig.authStrategy}", but per-persona visible-field sets ` +
        'need distinct org users. Set SF_AUTH_STRATEGY=jwt and re-run — otherwise every persona ' +
        'would report "no access" and you would commit an empty contract.',
    );
    process.exit(1);
  }

  for (const objectApiName of objectNames) {
    console.warn(`\n// ── ${objectApiName} ──────────────────────────────────────────────`);
    console.warn('visibleFieldsByPersona: {');

    // Only non-privileged personas: an admin sees everything, so its "visible set" is the whole
    // object and asserts nothing.
    for (const persona of ASSERTABLE_PERSONAS) {
      let client: { org: ApiRequest; dispose: () => Promise<void> } | undefined;
      try {
        client = await clientFor(persona.key);
        const info = await fetchObjectInfo(client.org, objectApiName);
        const fields = visibleFieldNames(info);
        const formatted = fields.map((name) => `'${name}'`).join(', ');
        console.warn(`  [Personas.${persona.key}.key]: [${formatted}],`);
      } catch (error) {
        // A persona with no object access legitimately fails here — that IS its contract, recorded
        // as `queryable: false` in crudByPersona rather than as a field list.
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
        console.warn(`  // ${persona.key}: no access (${message ?? 'unknown'})`);
      } finally {
        await client?.dispose();
      }
    }

    console.warn('},');
  }

  console.warn(
    '\n// Paste into the object contract, review it like code, and commit. A future diff here is ' +
      'your field-leak report.',
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
