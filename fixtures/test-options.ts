import { mergeTests } from '@playwright/test';
import { test as apiTest } from './api/api-fixture';
import { test as pomTest } from './pom/page-object-fixture';
import { test as helperTest } from './helper/helper-fixture';
import { test as salesforceOrgTest } from './salesforce/org-fixture';
import { test as salesforcePersonaTest } from './salesforce/persona-fixture';

/**
 * THE single import point for every spec file.
 *
 *   import { test, expect } from '../../fixtures/test-options';
 *
 * Never import `test` from '@playwright/test' directly — that bypasses all custom
 * fixtures (api, page objects, helpers). Merge new fixture modules here with mergeTests.
 *
 * The Salesforce fixtures (`org`, `orgAs`, `orgSession`, `asPersona`) are merged in here too and
 * cost nothing when unused: Playwright fixtures are LAZY, so their setup only runs for a test that
 * actually destructures them, and `config/salesforce.config.ts` reads env vars through getters. So
 * a non-Salesforce project needs no SF_* variables set. `bootstrap` prunes them for other profiles.
 */
export const test = mergeTests(
  apiTest,
  pomTest,
  helperTest,
  salesforceOrgTest,
  salesforcePersonaTest,
);
export { expect } from '@playwright/test';
