import { test as setup, expect } from '@playwright/test';
import { getOrgSession, applySession } from './auth';
import { salesforceConfig } from '../../config/salesforce.config';
import { UI_PERSONAS } from '../../test-data/salesforce/personas';
import { LightningRoutes } from '../../enums/salesforce/lightning-routes';

/**
 * Salesforce auth setup — one authenticated storageState PER PERSONA.
 *
 * Runs in the `setup:salesforce` project before any UI project. Each persona's state lands at
 * `.auth/sf-<key>.json`, and UI tests either use the project default or ask for a specific persona
 * via the `asPersona` fixture.
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
 */
for (const persona of UI_PERSONAS) {
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

      await context.storageState({ path: salesforceConfig.storageStateFor(persona.key) });
    } finally {
      await context.close();
    }
  });
}
