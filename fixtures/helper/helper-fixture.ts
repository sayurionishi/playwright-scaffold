import { test as base } from '@playwright/test';
import { ApiRequest } from '@fixtures/api/api-request';
import { ApiEndpoints } from '@enums/util/api-endpoints';
import { makeUser } from '@test-data/factories/user.factory';
import { UserSchema, type User } from '@fixtures/api/schemas/user.schema';

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
  seededUser: User;
}

export const test = base.extend<HelperFixtures>({
  seededUser: async ({ request }, use) => {
    const api = new ApiRequest(request);
    const draft = makeUser();

    /* SETUP — create via API (fast, deterministic).
       `schema` and `expectStatus` are both load-bearing, and this fixture had NEITHER:

         const created = await api.post<{ id: string; email: string }>(…, { data: draft });
         const user = created.data ?? { id: '', email: draft.email };          // ❌

       That type parameter was a fiction — nothing validated the response. Against a 500 or an
       HTML error page, `created.data` was a string, `user.id` was `undefined`, the teardown
       branch below silently did nothing, and the consuming test failed much later on something
       unrelated. The `??` fallback could not even fire, because a `{}` body is not nullish.

       With a schema, a bad response fails HERE, naming the endpoint and the body. That is the
       whole point of Constitution #7: fail at the boundary, not forty lines downstream. */
    const { data: user } = await api.post(ApiEndpoints.USERS, {
      data: draft,
      schema: UserSchema,
      expectStatus: 201,
    });

    await use(user);

    /* TEARDOWN — best-effort delete; never mask a test failure. No `if (user.id)` guard is
       needed any more: the schema guarantees `id` is a non-empty uuid, so reaching this line at
       all means the record exists. */
    await api.delete(`${ApiEndpoints.USERS}/${user.id}`).catch(() => {
      /* ignored: cleanup must not overwrite the test's own result */
    });
  },
});
