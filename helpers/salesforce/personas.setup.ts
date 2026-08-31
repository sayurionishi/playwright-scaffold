import fs from 'node:fs';
import path from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { getOrgSession, applySession } from './auth';
import { salesforceConfig } from '../../config/salesforce.config';
import { UI_PERSONAS } from '../../test-data/salesforce/personas';
import { LightningRoutes } from '../../enums/salesforce/lightning-routes';

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
