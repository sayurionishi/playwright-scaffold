/**
 * Application configuration — the single source of truth for URLs and runtime settings.
 *
 * RULES (see the `config` skill):
 *  - URLs and credentials come from `process.env.*` (loaded per-environment in playwright.config.ts).
 *  - Endpoint PATHS and UI MESSAGES do NOT live here — they live in `enums/`.
 *  - Never hardcode a URL or secret in a test or page object. Read it from here.
 *
 * ── WHY EVERY PROPERTY IS A GETTER (do not "simplify" these back to plain values) ──────────────
 *
 * A plain property is evaluated when this MODULE is first imported. Under ESM, every `import` in a
 * file is hoisted and evaluated BEFORE that file's own statements run — so in a standalone entry
 * point that loads its env file itself:
 *
 *     import { appConfig } from '@config/app.config';   // ← evaluated FIRST
 *     dotenv.config({ path: `env/.env.${ENVIRONMENT}` }); // ← runs SECOND, too late
 *
 * …a plain `baseUrl: process.env.BASE_URL ?? '…'` would capture the value from BEFORE the env file
 * loaded, and silently fall back to the default. Playwright's own config loads dotenv before the
 * test files import this, which is why the test run looks fine — but `scripts/*.ts` are exactly the
 * standalone case, and this bug shipped there once already (an `SF_API_VERSION` in the env file was
 * ignored and the WRONG version was stamped into a committed snapshot).
 *
 * A getter defers the read to first ACCESS, which is always after dotenv has run. Keep it that way.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
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
  /**
   * Active environment name — 'dev' | 'staging' | 'ci' | whatever `env/.env.<name>` you loaded.
   * Mirrors the `ENVIRONMENT` constant `playwright.config.ts` uses to choose the env file. That
   * constant stays a raw inline read there (it must know which file to load before any variable
   * exists); everywhere that runs after dotenv, read it from here.
   */
  get environment(): string {
    return process.env.ENVIRONMENT ?? 'dev';
  },

  /** Base URL of the app under test. */
  get baseUrl(): string {
    return process.env.BASE_URL ?? 'http://localhost:3000';
  },

  /**
   * Root URL of the API under test — host AND any path prefix.
   *
   * `enums/util/api-endpoints.ts` holds PATHS ONLY (`/users`), which are appended to this value, so
   * if your API lives under a prefix the prefix belongs HERE: `API_URL=https://app.example.com/api`
   * makes `ApiEndpoints.USERS` resolve to `https://app.example.com/api/users`.
   *
   * Falling back to `baseUrl` assumes the API shares the app's origin at its root. If it doesn't,
   * set `API_URL` — an unset `API_URL` cannot be distinguished from "the API is at the root", so
   * the fallback stays deliberately bare rather than guessing a `/api` segment.
   */
  get apiUrl(): string {
    return process.env.API_URL ?? this.baseUrl;
  },

  /**
   * Path where auth storage state is written by `auth.setup.ts` and read by the UI projects.
   *
   * Namespaced by environment (`.auth/<env>/user.json`), matching `salesforceConfig.storageStateFor`.
   * Without the environment segment, a `functional` run against staging can consume the session
   * `setup` minted for dev — which fails looking like an auth bug rather than an environment mixup.
   */
  get storageState(): string {
    return process.env.STORAGE_STATE ?? `.auth/${this.environment}/user.json`;
  },

  /** Test-user credentials. Read lazily so the env var is only required when actually used. */
  credentials: {
    get email(): string {
      return required('TEST_USER_EMAIL');
    },
    get password(): string {
      return required('TEST_USER_PASSWORD');
    },
  },

  /** True when running in CI (GitHub Actions sets CI=1). */
  get isCI(): boolean {
    return !!process.env.CI;
  },
} as const;
