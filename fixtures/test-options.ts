import { mergeTests } from '@playwright/test';
import { test as apiTest } from './api/api-fixture';
import { test as pomTest } from './pom/page-object-fixture';
import { test as helperTest } from './helper/helper-fixture';

/**
 * THE single import point for every spec file.
 *
 *   import { test, expect } from '../../fixtures/test-options';
 *
 * Never import `test` from '@playwright/test' directly — that bypasses all custom
 * fixtures (api, page objects, helpers). Merge new fixture modules here with mergeTests.
 */
export const test = mergeTests(apiTest, pomTest, helperTest);
export { expect } from '@playwright/test';
