import { test, expect } from '../../fixtures/test-options';
import { ApiEndpoints, buildPath } from '../../enums/util/api-endpoints';
import { UserSchema, UserListSchema } from '../../fixtures/api/schemas/user.schema';
import { ErrorResponseSchema } from '../../fixtures/api/schemas/_error.schema';
import { makeUser } from '../../test-data/factories/user.factory';

/**
 * EXAMPLE API suite — the backend is the system under test. Runs in the `api` project
 * (no browser). Every test is tagged @api.
 *
 * Conventions on show:
 *  - one describe per method + path
 *  - validate EVERY response body against a Zod schema (api.get/post(..., { schema }))
 *  - cover the status matrix: 200/201, 400/422, 401, 404, 409, 204, …
 *  - happy-path payloads from Faker factories; invalid inputs from static tiers (see *.security.spec.ts)
 */
test.describe('GET /users', () => {
  test('returns a validated user list', { tag: '@api' }, async ({ api }) => {
    const { status, data } = await api.get(ApiEndpoints.USERS, { schema: UserListSchema });
    expect(status).toBe(200);
    expect(data.total).toBeGreaterThanOrEqual(0);
  });
});

test.describe('POST /users', () => {
  test(
    'creates a user (201) and the body matches the contract',
    { tag: '@api' },
    async ({ api }) => {
      const draft = makeUser();
      const { status, data } = await api.post(ApiEndpoints.USERS, {
        data: draft,
        schema: UserSchema,
        expectStatus: 201,
      });
      expect(status).toBe(201);
      expect(data.email).toBe(draft.email);

      // teardown
      await api.delete(buildPath(ApiEndpoints.USER_BY_ID, { id: data.id })).catch(() => {});
    },
  );

  test(
    'rejects an empty body (400/422) with an error envelope',
    { tag: '@api' },
    async ({ api }) => {
      const { status, data } = await api.post(ApiEndpoints.USERS, {
        data: {},
        schema: ErrorResponseSchema,
      });
      expect([400, 422]).toContain(status);
      expect(data.detail).toBeDefined();
    },
  );
});

test.describe('GET /users/:id', () => {
  test('returns 404 for a non-existent id', { tag: '@api' }, async ({ api }) => {
    const { status } = await api.get(
      buildPath(ApiEndpoints.USER_BY_ID, { id: crypto.randomUUID() }),
    );
    expect(status).toBe(404);
  });
});
