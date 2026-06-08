/**
 * UI routes — single source of truth for every page path the tests navigate to.
 * Relative to BASE_URL. EXAMPLES — replace with your app's real routes.
 */
export const Routes = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  PRODUCTS: '/products',
} as const;

export type Route = (typeof Routes)[keyof typeof Routes];
