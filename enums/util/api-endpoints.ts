/**
 * API endpoint paths — single source of truth for every backend route the tests hit.
 *
 * Paths only (relative to API_URL). Never the full URL — the host comes from `appConfig.apiUrl`.
 * Path params use `:param` tokens; build concrete paths with the helper below.
 *
 * These are EXAMPLES. Replace with your app's real endpoints (verify against OpenAPI/Swagger).
 */
export const ApiEndpoints = {
  /** Auth */
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',

  /** Example resource group */
  USERS: '/users',
  USER_BY_ID: '/users/:id',
  PRODUCTS: '/products',
  PRODUCT_BY_ID: '/products/:id',
} as const;

export type ApiEndpoint = (typeof ApiEndpoints)[keyof typeof ApiEndpoints];

/**
 * Replace `:param` tokens in an endpoint path.
 * @example buildPath(ApiEndpoints.USER_BY_ID, { id: 'abc' }) // '/users/abc'
 */
export function buildPath(
  endpoint: ApiEndpoint,
  params: Record<string, string | number> = {},
): string {
  return Object.entries(params).reduce<string>(
    (path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(String(value))),
    endpoint,
  );
}
