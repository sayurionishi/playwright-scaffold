import type { Page, Response } from '@playwright/test';

/**
 * Deterministic network waits — the antidote to flaky UI tests.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS (read before using):
 *
 * `page.waitForLoadState('networkidle')` is BANNED in this scaffold. On any modern
 * SPA (and especially Salesforce Lightning) the network is never quiet for the 500 ms
 * networkidle requires — background polling, batched XHRs, analytics beacons. So the
 * wait either hangs until timeout or resolves in a random gap between requests. It is
 * non-deterministic by construction.
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
