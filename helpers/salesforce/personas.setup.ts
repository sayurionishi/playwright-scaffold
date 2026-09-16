import fs from 'node:fs';
import path from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { getOrgSession, applySession } from './auth';
import { salesforceConfig } from '@config/salesforce.config';
import { UI_PERSONAS } from '@test-data/salesforce/personas';
import { LightningRoutes } from '@enums/salesforce/lightning-routes';

/**
 * Salesforce auth setup — one authenticated storageState PER PERSONA, PER ENVIRONMENT.
 *
 * Runs in the `setup:salesforce` project before any UI project. Each persona's state lands at
 * `.auth/<environment>/sf-<key>.json`, and UI tests either use the project default or ask for a
 * specific persona via the `asPersona` fixture. The environment segment matters: run this against
 * dev, then again against staging without it, and the second run would silently overwrite the
 * first's state (or a stale dev session would get handed to a staging test) rather than each
 * environment keeping its own.
 *
 * No login form is driven here. We mint a session over the API (JWT bearer flow — MFA-exempt by
 * design) and inject it into a browser context. See the `salesforce-auth` skill.
 *
 * NEVER share one persona's context across personas: cached Lightning and metadata state produces
 * tests that pass alone and fail in the suite.
 *
 * Iterates UI_PERSONAS, not ALL_PERSONAS: an API-only identity (`uiCapable: false`, e.g. an
 * integration user) has no UI licence, so trying to build a browser session for it would fail here
 * for a correct reason and block the whole run.
 *
 * …and within those, only the ones whose username is actually configured — see `configured` below.
 */
/**
 * Which personas have a username configured.
 *
 * Computed at COLLECTION time so `--list` reflects what will really run, and so an unconfigured
 * persona is visibly absent rather than a runtime failure.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
 * This fan-out used to be all-or-nothing: `salesforceConfig.username()` throws for a missing
 * `SF_USERNAME_*`, one red setup test fails the project, and Playwright then marks the entire
 * `salesforce` project SKIPPED because its dependency failed. So the first run required all eight
 * org users, each with the Connected App assigned, before ANY UI test could execute — which makes
 * incremental adoption impossible and is the single most likely reason a team gives up here.
 *
 * Now an unconfigured persona is simply not collected, and the summary below says which and how to
 * add them. A persona whose username IS set but whose session fails still fails loudly: that is a
 * real problem (usually the Connected App not assigned) and must not be silently skipped.
 */
const configured = UI_PERSONAS.filter((persona) => {
  try {
    salesforceConfig.username(persona.key);
    return true;
  } catch {
    return false;
  }
});

const unconfigured = UI_PERSONAS.filter((persona) => !configured.includes(persona));

if (unconfigured.length > 0) {
  console.warn(
    `ℹ️  setup:salesforce is building sessions for ${configured.length}/${UI_PERSONAS.length} ` +
      `personas. Not configured: ${unconfigured.map((p) => p.key).join(', ')}.\n` +
      '   Add one env var per persona to enable it, e.g. ' +
      `SF_USERNAME_${unconfigured[0]?.key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase()}.\n` +
      '   Tests that assert as a missing persona will fail on its absence — that is deliberate; a ' +
      'persona test that silently skips is indistinguishable from one that passes.',
  );
}

if (configured.length === 0) {
  // Not a skip: an org IS configured (this project only exists when SF_LOGIN_URL is set), so zero
  // usable personas is a misconfiguration that must be visible rather than a quiet no-op.
  setup('at least one Salesforce persona is configured', async () => {
    expect(
      configured.length,
      'SF_LOGIN_URL is set but no SF_USERNAME_<PERSONA> variable is. Every Salesforce UI test ' +
        'needs at least one persona session. Add SF_USERNAME_STANDARD_USER (or whichever persona ' +
        'SF_DEFAULT_PERSONA names) and re-run. See the `salesforce-auth` skill.',
    ).toBeGreaterThan(0);
  });
}

for (const persona of configured) {
  setup(`authenticate ${persona.key}`, async ({ browser }) => {
    const session = await getOrgSession(persona.key);

    const context = await browser.newContext();
    try {
      await applySession(context, session);

      const page = await context.newPage();
      await page.goto(LightningRoutes.HOME);

      /**
       * Verify the session actually took BEFORE saving state.
       *
       * A failed injection presents as "logged out", which then surfaces as a mysterious
       * locator failure thirty lines into some unrelated test. Catching it here turns that into
       * one clear setup failure. The App Launcher exists only in an authenticated Lightning shell.
       *
       * If this fails: check "Lock sessions to the IP address from which they originated" in
       * Setup → Session Settings, and see docs/salesforce/VERIFY-BEFORE-FIRST-RUN.md.
       */
      await expect(
        page.getByRole('button', { name: 'App Launcher' }),
        `Session injection failed for persona "${persona.key}" — the Lightning shell did not load ` +
          'as an authenticated user. See docs/salesforce/VERIFY-BEFORE-FIRST-RUN.md.',
      ).toBeVisible({ timeout: 30_000 });

      const statePath = salesforceConfig.storageStateFor(persona.key);
      // `context.storageState()` does not create parent directories on its own — without this,
      // the FIRST run against a new environment fails on an ENOENT for `.auth/<env>/`, which reads
      // like a permissions bug rather than "this is a new environment directory".
      fs.mkdirSync(path.dirname(statePath), { recursive: true });
      await context.storageState({ path: statePath });
    } finally {
      await context.close();
    }
  });
}
