import { test, expect } from '../../fixtures/test-options';
import { ApiEndpoints, buildPath } from '../../enums/util/api-endpoints';
import { SECURITY_PAYLOADS, INVALID_IDS } from '../../test-data/static/util/invalid-values';

/**
 * EXAMPLE security / format-error suite — every field that accepts input MUST be fuzzed.
 * Tagged @security (a subset of @api; `npm run test:security` runs just these).
 *
 * The rule (security-testing skill): a malicious/malformed input must be REJECTED
 * (4xx) and must NOT be reflected, executed, or leak a stack trace. Never assert only
 * "empty body → 400"; loop per field over the malicious tiers.
 */
test.describe('POST /users — input fuzzing @security', () => {
  for (const payload of [...SECURITY_PAYLOADS.sqlInjection, ...SECURITY_PAYLOADS.xss]) {
    test(`rejects malicious email: ${payload.slice(0, 24)}`, async ({ api }) => {
      const { status, body } = await api.post(ApiEndpoints.USERS, {
        data: { email: payload, firstName: 'A', lastName: 'B', password: 'Password123!' },
      });
      expect(status, 'malicious input must be rejected with 4xx').toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500); // a 500 means the payload reached an unguarded code path
      expect(JSON.stringify(body)).not.toContain('<script>'); // never reflected verbatim
    });
  }
});

test.describe('GET /users/:id — path param fuzzing @security', () => {
  for (const badId of [...INVALID_IDS, ...SECURITY_PAYLOADS.pathTraversal]) {
    test(`rejects malformed id: ${badId.slice(0, 24)}`, async ({ api }) => {
      const { status } = await api.get(buildPath(ApiEndpoints.USER_BY_ID, { id: badId }));
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
    });
  }
});
