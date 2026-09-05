/**
 * Salesforce org authentication.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: never automate the Salesforce login form.
 *
 * It is slow, MFA-gated, possibly SSO-redirected, and rate-limited — the single largest source of
 * flake in Salesforce suites. Instead we mint a session over the API and inject it into the
 * browser. The JWT bearer flow is MFA-exempt BY DESIGN (it authenticates a trusted Connected App,
 * not an interactive user), so this is the supported path for automation, not a workaround.
 *
 * See the `salesforce-auth` skill for the one-time Connected App setup.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { APIRequestContext, BrowserContext } from '@playwright/test';
import { request as playwrightRequest } from '@playwright/test';
import { salesforceConfig } from '../../config/salesforce.config';
import { instanceHost } from '../../enums/salesforce/salesforce-api';

const execFileAsync = promisify(execFile);

/** An authenticated org session. `accessToken` IS a live session id — never log it. */
export interface OrgSession {
  readonly accessToken: string;
  /** API host, e.g. https://acme--uat.sandbox.my.salesforce.com. Read from the token response. */
  readonly instanceUrl: string;
  readonly personaKey: string;
}

/**
 * Cache sessions per persona so a 4-project run mints one token per persona, not one per test.
 *
 * Keyed by personaKey only — not by environment — and that's safe: `ENVIRONMENT` is resolved once,
 * by `dotenv.config()`, before any code in this process runs, so a single process only ever talks
 * to ONE environment. There is no "switch environments mid-run" case to guard against here; that's
 * what `salesforceConfig.storageStateFor` and the generated snapshot map exist for instead.
 */
const sessionCache = new Map<string, OrgSession>();

/** Emit the sfdx single-identity warning once per process, not once per fixture. */
let sfdxCollapseWarned = false;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Build and sign the RS256 JWT assertion for the bearer flow.
 *
 * Node's built-in crypto signs this — no jsonwebtoken dependency needed.
 * `aud` must be the LOGIN host (login/test.salesforce.com), not the instance URL. Getting this
 * wrong is the most common cause of `invalid_grant` with no further detail.
 */
function buildAssertion(username: string): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: salesforceConfig.clientId,
      sub: username,
      aud: salesforceConfig.loginUrl,
      // Short-lived on purpose: the assertion is exchanged immediately. Salesforce rejects
      // anything more than ~3 minutes out.
      exp: Math.floor(Date.now() / 1000) + 180,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(salesforceConfig.privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

interface TokenResponse {
  access_token: string;
  instance_url: string;
}

function assertTokenResponse(body: unknown, context: string): TokenResponse {
  if (typeof body !== 'object' || body === null) {
    throw new Error(`${context}: token endpoint returned a non-object response.`);
  }
  const record = body as Record<string, unknown>;
  if (typeof record.access_token !== 'string' || typeof record.instance_url !== 'string') {
    // Salesforce puts the useful part in `error_description`. Surface it — but never the token.
    const error = typeof record.error === 'string' ? record.error : 'unknown_error';
    const description =
      typeof record.error_description === 'string' ? record.error_description : '(no description)';
    throw new Error(
      `${context}: ${error} — ${description}\n` +
        "Common causes: the Connected App is not assigned to this user's profile/permission set " +
        '(the step everyone forgets), SF_LOGIN_URL points at the wrong host (login vs test), or ' +
        'the private key does not match the uploaded certificate. See the `salesforce-auth` skill.',
    );
  }
  return { access_token: record.access_token, instance_url: record.instance_url };
}

/** JWT bearer flow — the CI default. */
async function authenticateJwt(personaKey: string): Promise<OrgSession> {
  const username = salesforceConfig.username(personaKey);
  const context: APIRequestContext = await playwrightRequest.newContext({
    baseURL: salesforceConfig.loginUrl,
  });
  try {
    const response = await context.post('/services/oauth2/token', {
      form: {
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: buildAssertion(username),
      },
    });
    const body: unknown = await response.json();
    const token = assertTokenResponse(body, `JWT auth failed for persona "${personaKey}"`);
    return {
      accessToken: token.access_token,
      instanceUrl: token.instance_url,
      personaKey,
    };
  } finally {
    await context.dispose();
  }
}

/**
 * Reuse a session the `sf` CLI already holds. Local-dev convenience.
 *
 * SINGLE IDENTITY: the CLI holds one session per alias, so this strategy cannot represent distinct
 * personas. It serves the admin and subject keys (both mapping to that one session, with a loud
 * warning) and refuses everything else, because a permission matrix built on one identity would be
 * green and meaningless.
 */
async function authenticateSfdx(personaKey: string): Promise<OrgSession> {
  const adminKey = salesforceConfig.adminPersona;
  const subjectKey = salesforceConfig.defaultPersona;

  // The CLI holds exactly ONE session, so only the two identities the fixtures need can be served,
  // and they both resolve to that same session (see the warning below). Any OTHER persona is a
  // permission-matrix request, which is meaningless without distinct users — so it fails loudly.
  if (personaKey !== adminKey && personaKey !== subjectKey) {
    throw new Error(
      `The "sfdx" strategy holds a single CLI session, so it can only serve "${adminKey}" (admin) or ` +
        `"${subjectKey}" (subject) — "${personaKey}" was requested. A persona matrix needs distinct ` +
        'org users, so set SF_AUTH_STRATEGY=jwt for permission testing. See `salesforce-auth`.',
    );
  }

  if (adminKey !== subjectKey && !sfdxCollapseWarned) {
    sfdxCollapseWarned = true;
    console.warn(
      `⚠️  SF_AUTH_STRATEGY=sfdx: the admin ("${adminKey}") and subject ("${subjectKey}") identities ` +
        'both resolve to the ONE session the sf CLI holds. The identity split is therefore NOT ' +
        'exercised locally — a green UI run here does not prove the subject persona can do the ' +
        'thing. Run the contract and persona suites against a jwt-configured org.',
    );
  }
  const { stdout } = await execFileAsync('sf', [
    'org',
    'display',
    '--target-org',
    salesforceConfig.sfdxTargetOrg,
    '--json',
  ]);
  const parsed: unknown = JSON.parse(stdout);
  const result = (parsed as { result?: Record<string, unknown> }).result;
  const accessToken = result?.accessToken;
  const instanceUrl = result?.instanceUrl;
  if (typeof accessToken !== 'string' || typeof instanceUrl !== 'string') {
    throw new Error(
      `sf CLI did not return a usable session for "${salesforceConfig.sfdxTargetOrg}". ` +
        'Run `sf org login web --target-org <alias>` first.',
    );
  }
  return { accessToken, instanceUrl, personaKey };
}

/**
 * Username-password OAuth. LAST RESORT — requires MFA disabled for the user, which Salesforce is
 * progressively removing, and the password must carry the security token appended. Supported for
 * legacy orgs; do not build on it.
 */
async function authenticatePassword(personaKey: string): Promise<OrgSession> {
  const context: APIRequestContext = await playwrightRequest.newContext({
    baseURL: salesforceConfig.loginUrl,
  });
  try {
    const response = await context.post('/services/oauth2/token', {
      form: {
        grant_type: 'password',
        client_id: salesforceConfig.clientId,
        client_secret: process.env.SF_CLIENT_SECRET ?? '',
        username: salesforceConfig.username(personaKey),
        password: salesforceConfig.password(personaKey),
      },
    });
    const body: unknown = await response.json();
    const token = assertTokenResponse(body, `Password auth failed for persona "${personaKey}"`);
    return { accessToken: token.access_token, instanceUrl: token.instance_url, personaKey };
  } finally {
    await context.dispose();
  }
}

/**
 * Get an org session for a persona, using the configured strategy. Cached per persona per process.
 *
 * @param personaKey key from `test-data/salesforce/personas.ts`
 */
export async function getOrgSession(
  personaKey: string = salesforceConfig.defaultPersona,
): Promise<OrgSession> {
  const cached = sessionCache.get(personaKey);
  if (cached) return cached;

  const strategy = salesforceConfig.authStrategy;
  const session =
    strategy === 'jwt'
      ? await authenticateJwt(personaKey)
      : strategy === 'sfdx'
        ? await authenticateSfdx(personaKey)
        : await authenticatePassword(personaKey);

  sessionCache.set(personaKey, session);
  return session;
}

/**
 * Inject a session into a browser context via the `sid` cookie — the PREFERRED mechanism. No
 * navigation to a login endpoint at all.
 *
 * The cookie domain must be the INSTANCE host from the token response
 * (`acme--uat.sandbox.my.salesforce.com`), not the Lightning host. Don't construct it — Salesforce
 * gives it to you.
 *
 * ⚠️ ORG-DEPENDENT. "Lock sessions to the IP address from which they originated" (Setup → Session
 * Settings) breaks this when your API call and browser egress from different IPs. If auth
 * mysteriously redirects to the login page, check that setting first. See
 * docs/salesforce/VERIFY-BEFORE-FIRST-RUN.md.
 */
export async function applySession(context: BrowserContext, session: OrgSession): Promise<void> {
  await context.addCookies([
    {
      name: 'sid',
      value: session.accessToken,
      domain: instanceHost(session.instanceUrl),
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'None',
    },
  ]);
}

/**
 * frontdoor.jsp URL — the classic FALLBACK for session injection.
 *
 * ⚠️ Salesforce has shipped release updates restricting session ids passed to frontdoor.jsp.
 * Prefer `applySession`. Keep this for orgs where cookie injection is blocked, and expect it to
 * stop working eventually.
 */
export function frontdoorUrl(session: OrgSession, returnPath = '/lightning/page/home'): string {
  return (
    `${session.instanceUrl}/secur/frontdoor.jsp` +
    `?sid=${encodeURIComponent(session.accessToken)}&retURL=${encodeURIComponent(returnPath)}`
  );
}

/** Bearer auth header for direct REST calls with this session. */
export function authHeaders(session: OrgSession): Record<string, string> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Redact anything token-shaped before it reaches a log or an error message. A Salesforce access
 * token IS a live session — leaking one into CI output is a real incident, not a style issue.
 */
export function redactToken(text: string): string {
  return text.replace(/00D[a-zA-Z0-9!._]{20,}/g, '00D***REDACTED***');
}

/** Test-only: clear the session cache (used by unit-style checks of the auth layer). */
export function clearSessionCache(): void {
  sessionCache.clear();
}
