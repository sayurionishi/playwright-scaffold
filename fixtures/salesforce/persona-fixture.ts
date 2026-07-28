import fs from 'node:fs';
import { test as base, type BrowserContext, type Page } from '@playwright/test';
import { salesforceConfig } from '../../config/salesforce.config';
import { LightningRecordPage } from '../../pages/salesforce/lightning-record.page';
import { ListViewPage } from '../../pages/salesforce/list-view.page';

/**
 * Persona-scoped browser contexts.
 *
 * A UI project already runs as its default persona (via that project's `storageState`). This fixture
 * is for a test that needs a DIFFERENT persona — chiefly the permission matrix, where the whole point
 * is comparing what two identities can see.
 *
 * Each call builds a fresh context from that persona's stored state and tears it down after the test.
 * Contexts are NEVER shared between personas: cached Lightning and metadata state is exactly what
 * makes a permissions test pass alone and fail in the suite. See `salesforce-personas`.
 */
export interface PersonaSession {
  readonly context: BrowserContext;
  readonly page: Page;
  /** A record page bound to an object. Object API name comes from `describe` (rule #15). */
  recordPage(objectApiName: string): LightningRecordPage;
  listView(objectApiName: string): ListViewPage;
}

export interface PersonaFixtures {
  /**
   * Open a browser session as a specific persona.
   *
   *   const rep = await asPersona('salesRep');
   *   await rep.recordPage('Opportunity').gotoRecord(id);
   */
  asPersona: (personaKey: string) => Promise<PersonaSession>;
}

export const test = base.extend<PersonaFixtures>({
  asPersona: async ({ browser }, use) => {
    const opened: BrowserContext[] = [];

    await use(async (personaKey: string) => {
      const statePath = salesforceConfig.storageStateFor(personaKey);

      /**
       * Guard with a real message. Without this, a missing state file surfaces as a raw ENOENT from
       * deep inside Playwright, which reads like a bug in the framework rather than "you ran this
       * from a project that doesn't depend on setup:salesforce" — the actual, common cause (e.g.
       * calling `asPersona` from the browserless `org` project).
       */
      if (!fs.existsSync(statePath)) {
        throw new Error(
          `No stored session for persona "${personaKey}" at ${statePath}.\n` +
            '  • Run the setup project first: npx playwright test --project=setup:salesforce\n' +
            `  • Check "${personaKey}" exists in personas.ts and is uiCapable (API-only personas get ` +
            'no browser state by design)\n' +
            '  • Check the calling project declares dependencies: ["setup:salesforce"] — the `org` ' +
            'project deliberately does not, so use `orgAs` there instead of `asPersona`.',
        );
      }

      const context = await browser.newContext({ storageState: statePath });
      opened.push(context);
      const page = await context.newPage();
      return {
        context,
        page,
        recordPage: (objectApiName: string) => new LightningRecordPage(page, objectApiName),
        listView: (objectApiName: string) => new ListViewPage(page, objectApiName),
      };
    });

    for (const context of opened) {
      await context.close();
    }
  },
});
