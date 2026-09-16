import type { Page, Response } from '@playwright/test';

/**
 * Deterministic network waits — the antidote to flaky UI tests.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS (read before using):
 *
 * `page.waitForLoadState('networkidle')` is unusable on an SPA. The network is never
 * quiet for the 500 ms networkidle requires — background polling, batched XHRs,
 * analytics beacons — so the wait either hangs until timeout or resolves in a random
 * gap between requests. It is non-deterministic by construction.
 *
 * SCOPE, precisely (Constitution #2): it is a REFUSAL on the `salesforce` profile,
 * where Aura genuinely never settles, and on any chatty SPA. It remains legitimate on a
 * static/SSR page that really does go quiet. It is NOT globally banned — ESLint only
 * warns — so this file is the replacement you should reach for, not a prohibition
 * notice. The `wait-strategy` skill is the authority.
 *
 * Instead, wait for the SPECIFIC response that gates your next action.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE GOLDEN RULE — PRE-REGISTER BEFORE YOU TRIGGER:
 *
 * `page.waitForResponse(...)` only catches responses that arrive AFTER it is called.
 * If you click first and register the wait second, a fast response is already gone and
 * the wait silently times out. Always create the promise as a const BEFORE the click:
 *
 *   const loaded = waitForRest(page, '/api/products');   // 1. arm the listener
 *   await searchButton.click();                          // 2. trigger the request
 *   await loaded;                                         // 3. await the response
 *
 * For concurrent requests, arm both, then trigger, then Promise.all:
 *
 *   const a = waitForRest(page, '/api/cart');
 *   const b = waitForGraphQL(page, 'UpdateCartTotals');
 *   await option.click();
 *   await Promise.all([a, b]);
 * ─────────────────────────────────────────────────────────────────────────────
 */

const DEFAULT_TIMEOUT = 15_000;

/**
 * Wait for a REST response whose URL contains `urlSubstring`. Matches ANY status by
 * default (a 401/422 is still "the request completed" — pin `status` only when you
 * specifically need a success code). Pre-register BEFORE the action that triggers it.
 */
export function waitForRest(
  page: Page,
  urlSubstring: string,
  options: { timeout?: number; status?: number } = {},
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, status } = options;
  return page.waitForResponse(
    (response) => {
      if (!response.url().includes(urlSubstring)) return false;
      return status === undefined || response.status() === status;
    },
    { timeout },
  );
}

/**
 * Wait for a GraphQL response by operation name (matched against the request body).
 * Works for both queries and mutations. Pre-register BEFORE the triggering action.
 */
export function waitForGraphQL(
  page: Page,
  operationName: string,
  options: { timeout?: number } = {},
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT } = options;
  return page.waitForResponse(
    (response) => {
      const request = response.request();
      if (request.method() !== 'POST') return false;
      const body = request.postData() ?? '';
      return body.includes(`"operationName":"${operationName}"`) || body.includes(operationName);
    },
    { timeout },
  );
}

/**
 * Stub a JSON response for requests whose URL contains `urlSubstring`.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────────
 *
 * Without route interception the only way to test an error state is to make the real backend
 * produce it — which for a 500, a timeout, or an empty-list state usually means you cannot test it
 * at all. So those paths went untested, not by decision but by absence of a tool.
 *
 * ── WHEN IT IS THE RIGHT TOOL ─────────────────────────────────────────────────────────────────
 *
 * ✅ Error and edge states the backend will not produce on demand: 500, 403, 429, an empty list,
 *    a malformed payload, a slow response.
 * ✅ Asserting how the UI DEGRADES — the error banner, the retry affordance, the empty state.
 *
 * ── WHEN IT IS THE WRONG TOOL ─────────────────────────────────────────────────────────────────
 *
 * ❌ Happy paths. A mocked happy path asserts that your mock matches your UI, which is a tautology:
 *    it passes for ever, including after the real API changes shape. That is the classic way a
 *    mocked suite goes green while the product is broken.
 * ❌ Anything on the `salesforce` profile. Lightning's own framework traffic goes through the same
 *    endpoints as your data, so intercepting `ui-api` breaks the page rather than stubbing it. Use
 *    a real org and arrange the state through `adminOrg` instead.
 * ❌ Replacing an API test. If the backend IS the system under test, test the backend
 *    (`api-testing`), not a fixture of your own devising.
 *
 * Pair it with a real contract test: the mock proves the UI handles a 500, and the API test proves
 * the endpoint's real shape. Neither substitutes for the other.
 *
 * @example
 * await mockJson(page, ApiEndpoints.PRODUCTS, { message: 'boom' }, 500);
 * await productsPage.goto();
 * await expect(productsPage.errorBanner).toBeVisible();
 */
export async function mockJson(
  page: Page,
  urlSubstring: string,
  body: unknown,
  status = 200,
): Promise<void> {
  await page.route(
    (url) => url.href.includes(urlSubstring),
    async (route) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      }),
  );
}

/**
 * Stop stubbing `urlSubstring` and let requests hit the real backend again.
 *
 * Only needed mid-test — Playwright discards routes with the context, so a route registered in one
 * test never leaks into another.
 */
export async function unmock(page: Page, urlSubstring: string): Promise<void> {
  await page.unroute((url) => url.href.includes(urlSubstring));
}
