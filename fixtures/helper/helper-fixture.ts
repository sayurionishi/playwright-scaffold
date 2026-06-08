import { test as base } from '@playwright/test';
import { ApiRequest } from '../api/api-request';
import { ApiEndpoints } from '../../enums/util/api-endpoints';
import { makeUser } from '../../test-data/factories/user.factory';

/**
 * Helper fixtures — manage SETUP/TEARDOWN lifecycle for shared test resources.
 *
 * Promote setup/teardown to a helper fixture ONLY when the same lifecycle is reused
 * across 3+ files. Otherwise call `api` directly in the test. (Avoid premature fixtures.)
 *
 * The teardown half (after `await use`) runs even when the test fails — so created
 * data never leaks. This is the API-as-setup pattern: fast state via the API, so the
 * UI test can focus on the behavior it actually verifies.
 */
export interface HelperFixtures {
  /** Creates a user via the API, yields it, deletes it on teardown (runs on failure too). */
  seededUser: { id: string; email: string };
}

export const test = base.extend<HelperFixtures>({
  seededUser: async ({ request }, use) => {
    const api = new ApiRequest(request);
    const draft = makeUser();

    // SETUP — create via API (fast, deterministic).
    const created = await api.post<{ id: string; email: string }>(ApiEndpoints.USERS, {
      data: draft,
    });
    const user = created.data ?? { id: '', email: draft.email };

    await use(user);

    // TEARDOWN — best-effort delete; never mask a test failure.
    if (user.id) {
      await api.delete(`${ApiEndpoints.USERS}/${user.id}`).catch(() => {
        /* best-effort cleanup */
      });
    }
  },
});
