/**
 * Application configuration — the single source of truth for URLs and runtime settings.
 *
 * RULES (see the `config` skill):
 *  - URLs and credentials come from `process.env.*` (loaded per-environment in playwright.config.ts).
 *  - Endpoint PATHS and UI MESSAGES do NOT live here — they live in `enums/`.
 *  - Never hardcode a URL or secret in a test or page object. Read it from here.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required env var "${name}". Add it to env/.env.<environment> (see env/*.example).`,
    );
  }
  return value;
}

export const appConfig = {
  /** Base URL of the app under test. */
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3000',

  /** Base URL of the API under test (defaults to baseUrl if unset). */
  apiUrl: process.env.API_URL ?? process.env.BASE_URL ?? 'http://localhost:3000/api',

  /** Path where auth storage state is written by auth.setup.ts. */
  storageState: process.env.STORAGE_STATE ?? '.auth/user.json',

  /** Test-user credentials. Read lazily via getters so the env var is only required when used. */
  credentials: {
    get email(): string {
      return required('TEST_USER_EMAIL');
    },
    get password(): string {
      return required('TEST_USER_PASSWORD');
    },
  },

  /** True when running in CI (GitHub Actions sets CI=1). */
  isCI: !!process.env.CI,
} as const;
