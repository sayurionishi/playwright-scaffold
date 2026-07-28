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

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * THE TIMEOUT BUDGET — why a stuck click is a DIAGNOSIS problem, not just a speed problem
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Playwright's `actionTimeout` defaults to **0 — no timeout at all**. So an un-clickable element
 * doesn't fail on its own; it spins until the TEST timeout kills the whole test. That's the
 * "how long does it get stuck?" feeling: 30 seconds by default, and the error you get is
 *
 *     Test timeout of 30000ms exceeded.
 *
 * …which tells you nothing. Set `actionTimeout` and the same failure reports:
 *
 *     locator.click: Timeout 10000ms exceeded.
 *     waiting for locator('button[name="Save"]')
 *       - locator resolved to <button disabled>…</button>
 *       - element is not enabled
 *
 * That names the element AND which actionability check failed. So the budget below is set for
 * DIAGNOSABILITY first and speed second.
 *
 * ── WHAT `click()` IS ACTUALLY WAITING FOR (the "actionability" checks) ────────────────────────
 *   1. attached to the DOM      4. receives pointer events (NOT covered by another element)
 *   2. visible                  5. enabled
 *   3. stable (not animating)
 *
 * #4 is the one that hangs in practice: the element is right there, visible, and permanently under
 * a toast, modal backdrop, sticky header, or a spinner overlay that never went away. Playwright
 * retries until timeout and only THEN tells you. Shorter timeout = you find out 10s in, not 30s in.
 *
 * ── THE ORDERING INVARIANT (this is the part that matters) ─────────────────────────────────────
 *
 *     actionTimeout  <  expect.timeout × (a few retries)  <  test timeout
 *
 * If `actionTimeout` ≥ the test timeout, the action timeout can never fire and you're back to the
 * useless generic message. Keep a wide gap so the SPECIFIC error always wins the race.
 *
 * ── NOT A LICENCE TO RAISE TIMEOUTS ───────────────────────────────────────────────────────────
 * Constitution #13: raising a timeout to make a red test pass is silencing a failure. A test that
 * needs longer says so locally and says why:
 *
 *     test.slow();                      // triples this test's timeout (built in, for known-slow tests)
 *     test.setTimeout(120_000);         // explicit, needs a comment justifying it
 *
 * A click that needs more than 10s is telling you something real: wrong locator, an overlay you
 * didn't wait for, or a missing pre-registered response wait. Fix that. See `wait-strategy`.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
const TIMEOUTS = {
  /** One user action (click, fill, hover, press). 10s is generous for a real interaction. */
  action: 10_000,
  /** One navigation. Page loads legitimately take longer than a click. */
  navigation: 20_000,
  /** Web-first assertions (`toBeVisible`, `toHaveText`). These retry, so this is per-assertion. */
  expect: 7_000,
  /** Default whole-test budget. Comfortably above action+navigation so the specific error wins. */
  test: 45_000,
  /** Multi-screen journeys legitimately take longer — but still bounded. */
  e2eTest: 120_000,
  /** Auth setup: token mint + browser launch + a page load. */
  setupTest: 60_000,
  /** No browser at all, so anything slow here is a network or org problem. */
  apiTest: 30_000,
  /**
   * Salesforce Lightning needs more headroom, and pretending otherwise creates false failures.
   * Aura hydration and the record-page bootstrap are genuinely slow — this is the one place where
   * a longer timeout is a fact about the platform, not a test smell.
   */
  salesforceAction: 15_000,
  salesforceNavigation: 30_000,
  salesforceTest: 90_000,
} as const;

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

  /** Default whole-test budget. Projects override where the platform justifies it. */
  timeout: TIMEOUTS.test,

  /**
   * Backstop for the whole run (CI only). Without it, one hung worker can burn the entire CI
   * allowance before anyone notices. Generous enough never to fire on a healthy suite.
   */
  globalTimeout: isCI ? 30 * 60_000 : undefined,

  /* Shared settings for all projects. */
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    /* getByTestId() resolves this attribute. Default is 'data-testid'; change here if your
       app uses 'data-test'/'data-qa' etc. https://playwright.dev/docs/locators#locate-by-test-id */
    testIdAttribute: 'data-testid',
    /**
     * FAIL FAST AND DIAGNOSABLY. See the TIMEOUT BUDGET block above — Playwright's default
     * actionTimeout is 0 (no timeout), which is why an un-clickable element hangs until the test
     * timeout and reports a useless generic message instead of naming the element.
     */
    actionTimeout: TIMEOUTS.action,
    navigationTimeout: TIMEOUTS.navigation,
  },
  expect: { timeout: TIMEOUTS.expect },

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
      // No browser, so there are no actionability waits to bound — a slow test here means a slow
      // network or a slow backend, and 30s is already a long time for one HTTP call.
      timeout: TIMEOUTS.apiTest,
      use: { baseURL: process.env.API_URL ?? BASE_URL },
    },
    /**
     * `org` — the Salesforce CONTRACT layer. No browser, no storageState: the `adminOrg`/`org`/
     * `orgAs` fixtures mint their own sessions per persona.
     *
     * This is where field types, lengths, picklist values, permission-set grants, object CRUD, and
     * the per-persona FLS matrix are asserted — dozens of combinations in seconds. The UI layer
     * then only tests behaviour. See docs/salesforce/TEST-ARCHITECTURE.md.
     *
     * Fast and dependency-free, so run it on every push. Prune if the profile isn't `salesforce`.
     */
    {
      name: 'org',
      testDir: './tests/salesforce/contract',
      // No browser. Each test is a couple of API calls; anything slower is an org problem.
      timeout: TIMEOUTS.apiTest,
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
      // Login flow + storage-state write. Slower than a normal test, still bounded.
      timeout: TIMEOUTS.setupTest,
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
      // Per persona: JWT mint + browser launch + a Lightning page load. Lightning-sized budget.
      timeout: TIMEOUTS.salesforceTest,
      use: { navigationTimeout: TIMEOUTS.salesforceNavigation },
    },
    /**
     * `salesforce` — the Lightning UI/BEHAVIOUR layer.
     *
     * Runs as the SUBJECT persona — a restricted user, NOT System Admin. That default is
     * deliberate: a UI test running as admin exercises a screen no real user sees, and an admin's
     * Modify All Data bypasses sharing and FLS, hiding the bugs you meant to catch. Records are
     * arranged and torn down through the `adminOrg` fixture instead.
     *
     * Tests needing a different identity use `asPersona` rather than this project's state.
     */
    {
      name: 'salesforce',
      testDir: './tests/salesforce/ui',
      /**
       * Lightning gets more headroom than any other UI project, and that is a fact about the
       * platform rather than a concession: Aura hydration and the record-page bootstrap are
       * genuinely slow. Squeezing these to the generic values produces false failures, which
       * teaches people to ignore timeouts — the opposite of what we want.
       */
      timeout: TIMEOUTS.salesforceTest,
      use: {
        ...devices['Desktop Chrome'],
        storageState: `.auth/sf-${process.env.SF_DEFAULT_PERSONA ?? 'standardUser'}.json`,
        actionTimeout: TIMEOUTS.salesforceAction,
        navigationTimeout: TIMEOUTS.salesforceNavigation,
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
      /**
       * A journey crosses several screens, so the TEST budget is larger — but the per-ACTION
       * budget deliberately is not. A single click should never take longer in an e2e test than in
       * a functional one; only the number of clicks changes.
       */
      timeout: TIMEOUTS.e2eTest,
      use: {
        ...devices['Desktop Chrome'],
        storageState: process.env.STORAGE_STATE ?? '.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
});
