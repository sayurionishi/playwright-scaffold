/**
 * Salesforce org configuration — the single source of truth for org URLs, the pinned API
 * version, and per-persona credentials.
 *
 * RULES (see the `config` and `salesforce-auth` skills):
 *  - Everything comes from `process.env.*` (loaded per-environment in playwright.config.ts).
 *  - Values are read through GETTERS so a non-Salesforce clone can import this file without
 *    every SF_* var being set. The error only fires when a test actually needs the value.
 *  - Never log `SF_JWT_PRIVATE_KEY` or an access token — the token IS a live session id.
 */

import fs from 'node:fs';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required env var "${name}". Add it to env/.env.<environment> ` +
        `(see env/.env.salesforce.example).`,
    );
  }
  return value;
}

/** How we obtain an org session. See the `salesforce-auth` skill for the trade-offs. */
export type SalesforceAuthStrategy = 'jwt' | 'sfdx' | 'password';

function resolveStrategy(): SalesforceAuthStrategy {
  const raw = process.env.SF_AUTH_STRATEGY;
  if (raw === 'jwt' || raw === 'sfdx' || raw === 'password') return raw;
  if (raw !== undefined && raw !== '') {
    throw new Error(`Invalid SF_AUTH_STRATEGY "${raw}". Expected one of: jwt | sfdx | password.`);
  }
  // Default: jwt in CI (no interactive session available), sfdx locally.
  return process.env.CI ? 'jwt' : 'sfdx';
}

export const salesforceConfig = {
  /**
   * Pinned Salesforce API version, e.g. 'v62.0'.
   *
   * PIN IT and ASSERT IT. Salesforce ships three releases a year; leaving this unpinned lets the
   * contract move under you, and letting it go stale eventually falls out of the supported window.
   * `tests/salesforce/metadata-contract.spec.ts` asserts the org still supports this value.
   */
  apiVersion: process.env.SF_API_VERSION ?? 'v62.0',

  /**
   * OAuth login host. Production/Dev Edition: https://login.salesforce.com
   * Sandboxes: https://test.salesforce.com  (or your My Domain sandbox URL)
   * This is the token endpoint host and the JWT `aud` claim — NOT the instance URL.
   */
  get loginUrl(): string {
    return process.env.SF_LOGIN_URL ?? 'https://test.salesforce.com';
  },

  /** Which session-acquisition strategy to use. */
  get authStrategy(): SalesforceAuthStrategy {
    return resolveStrategy();
  },

  /** Connected App consumer key (JWT bearer flow). */
  get clientId(): string {
    return required('SF_CLIENT_ID');
  },

  /**
   * RSA private key (PEM) for the JWT bearer assertion. Supply EITHER the PEM contents in
   * SF_JWT_PRIVATE_KEY (CI secret — note literal \n must be real newlines) or a path in
   * SF_JWT_KEY_PATH (local dev). Never commit either.
   */
  get privateKey(): string {
    const inline = process.env.SF_JWT_PRIVATE_KEY;
    if (inline !== undefined && inline !== '') {
      // CI secret stores often flatten newlines; restore them so crypto can parse the PEM.
      return inline.includes('\\n') ? inline.replace(/\\n/g, '\n') : inline;
    }
    const keyPath = process.env.SF_JWT_KEY_PATH;
    if (keyPath !== undefined && keyPath !== '') {
      return fs.readFileSync(keyPath, 'utf8');
    }
    throw new Error(
      'JWT auth needs a key: set SF_JWT_PRIVATE_KEY (PEM contents) or SF_JWT_KEY_PATH (file path). ' +
        'See the `salesforce-auth` skill for generating the key pair.',
    );
  },

  /** `sf` CLI target org alias or username (sfdx strategy). */
  get sfdxTargetOrg(): string {
    return required('SF_TARGET_ORG');
  },

  /** Default persona used by UI projects when a test does not ask for a specific one. */
  get defaultPersona(): string {
    return process.env.SF_DEFAULT_PERSONA ?? 'admin';
  },

  /**
   * Suffix appended to persona usernames, e.g. '.uat'.
   *
   * WHY: a sandbox refresh renames every user by appending the sandbox name
   * (`qa.user@acme.com` → `qa.user@acme.com.uat`). Keeping this env-driven means a refresh is a
   * one-line env change instead of editing every persona.
   */
  get usernameSuffix(): string {
    return process.env.SF_USERNAME_SUFFIX ?? '';
  },

  /**
   * Username for a persona. Reads `SF_USERNAME_<PERSONA_KEY>` (upper snake case) and appends
   * the sandbox suffix.
   *
   * @example username('salesRep') reads SF_USERNAME_SALES_REP
   */
  username(personaKey: string): string {
    const envKey = `SF_USERNAME_${personaKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`;
    return `${required(envKey)}${salesforceConfig.usernameSuffix}`;
  },

  /** Password for a persona (`password` strategy only — discouraged, see `salesforce-auth`). */
  password(personaKey: string): string {
    const envKey = `SF_PASSWORD_${personaKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}`;
    return required(envKey);
  },

  /** Where a persona's authenticated storage state is written. */
  storageStateFor(personaKey: string): string {
    return `.auth/sf-${personaKey}.json`;
  },

  /**
   * Prefix for every record this suite creates. Lets a human find and purge orphaned test data
   * with one list-view filter — orphans WILL accumulate in a shared sandbox. See `salesforce-data`.
   */
  testDataPrefix: process.env.SF_TEST_PREFIX ?? 'PWT-',

  /**
   * Abort a run when the org's remaining daily API requests fall below this fraction of Max.
   * The daily limit is org-wide and shared with production integrations — exhausting it has blast
   * radius well beyond your tests. See `salesforce-data`.
   */
  apiLimitAbortThreshold: Number(process.env.SF_API_LIMIT_THRESHOLD ?? '0.1'),
} as const;

/** Build a versioned REST path: `/services/data/v62.0/<suffix>`. */
export function dataPath(suffix: string): string {
  const clean = suffix.startsWith('/') ? suffix.slice(1) : suffix;
  return `/services/data/${salesforceConfig.apiVersion}/${clean}`;
}
