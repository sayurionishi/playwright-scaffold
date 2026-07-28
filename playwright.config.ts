import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'node:path';

/**
 * Environment loading.
 * `ENVIRONMENT` selects which env file loads (dev | staging | prod | ci).
 * Defaults to `dev`. Each file lives in `env/.env.<name>`.
 */
const ENVIRONMENT = process.env.ENVIRONMENT ?? 'dev';
dotenv.config({ path: path.resolve(process.cwd(), `env/.env.${ENVIRONMENT}`) });

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  /* Storage state produced by the auth setup project. */
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 4 : undefined,
  reporter: isCI
    ? [['html', { open: 'never' }], ['github'], ['list']]
    : [['html', { open: 'never' }], ['list']],
  /* Shared settings for all projects. */
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /* getByTestId() resolves this attribute. Default is 'data-testid'; change here if your
       app uses 'data-test'/'data-qa' etc. https://playwright.dev/docs/locators#locate-by-test-id */
    testIdAttribute: 'data-testid',
    /* Fail fast: default action/navigation timeouts kept tight on purpose.
       If a test needs longer, it asks for it explicitly — see wait-strategy skill. */
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  expect: { timeout: 10_000 },

  /**
   * Projects separate the system-under-test, NOT just folders.
   *  - `api`        : the backend IS the SUT. No browser. Fast. Runs in backend CI.
   *  - `setup`      : produces auth storage state for UI projects (skip if app has no login).
   *  - `functional` : a single screen/feature is the SUT (UI).
   *  - `e2e`        : a full multi-feature journey is the SUT (UI).
   * UI projects use the API only for fast setup/teardown via the apiRequest fixture.
   */
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: process.env.API_URL ?? BASE_URL },
    },
    /**
     * `org` — Salesforce metadata & permission checks. No browser, no auth storage state: the
     * `org`/`orgAs` fixtures mint their own sessions per persona. Fast enough to run on every push.
     * Prune this project if the profile isn't `salesforce`.
     */
    {
      name: 'org',
      testDir: './tests/salesforce',
      testIgnore: /record-crud\.spec\.ts/,
    },
    /**
     * NOTE: `testDir` is set explicitly on the setup projects. `testMatch` resolves relative to
     * `testDir`, which globally is './tests' — so a bare /.*\.setup\.ts/ pattern could never reach
     * the setup files that live under `helpers/`.
     */
    {
      name: 'setup',
      testDir: './helpers/auth',
      testMatch: /.*\.setup\.ts/,
    },
    /**
     * `setup:salesforce` — fans out to produce ONE storageState per persona
     * (`.auth/sf-<key>.json`). Sessions are minted over the API, never by driving the login form.
     * See the `salesforce-auth` skill.
     */
    {
      name: 'setup:salesforce',
      testDir: './helpers/salesforce',
      testMatch: /personas\.setup\.ts/,
    },
    /**
     * `salesforce` — Lightning UI tests, running as the default persona. Tests needing a different
     * identity use the `asPersona` fixture rather than this project's state.
     */
    {
      name: 'salesforce',
      testDir: './tests/salesforce',
      testMatch: /record-crud\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: `.auth/sf-${process.env.SF_DEFAULT_PERSONA ?? 'admin'}.json`,
      },
      dependencies: ['setup:salesforce'],
    },
    {
      name: 'functional',
      testDir: './tests/functional',
      use: {
        ...devices['Desktop Chrome'],
        storageState: process.env.STORAGE_STATE ?? '.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: {
        ...devices['Desktop Chrome'],
        storageState: process.env.STORAGE_STATE ?? '.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
