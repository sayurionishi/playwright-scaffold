import { test as base } from '@playwright/test';
import { ApiRequest } from './api-request';

export interface ApiFixtures {
  /** Typed, Zod-validating API client. Available in every test (UI tests use it for setup/teardown). */
  api: ApiRequest;
}

export const test = base.extend<ApiFixtures>({
  api: async ({ request }, use) => {
    await use(new ApiRequest(request));
  },
});
