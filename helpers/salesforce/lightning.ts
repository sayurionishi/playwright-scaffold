/**
 * Deterministic waits for Salesforce Lightning.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS — read before using (full detail in the `salesforce-waits` skill):
 *
 * 1. `networkidle` is a REFUSAL on Salesforce (Constitution #2). Aura server actions, CometD
 *    long-polling, and beacons mean the network is NEVER quiet for 500 ms. The wait either hangs to
 *    timeout or resolves in a random gap between requests.
 *
 * 2. You cannot wait on `/aura` by URL. EVERY Aura action posts to the same endpoint — the
 *    operation lives in the form-encoded `message` payload. A URL-substring wait on `/aura` matches
 *    whatever background poll fires next, resolves early, and produces an unreadable flake.
 *
 * 3. What IS deterministic: the UI API (`/services/data/vXX.0/ui-api/*`), used by Lightning record
 *    pages, forms, and list views. Versioned, identifiable, greppable. Wait on these.
 *
 * ⚠️ Not every Lightning surface uses the UI API — Aura-era and some managed-package components
 * still route through `/aura`. Confirm which path your screen actually uses (playwright-cli, watch
 * the network) before choosing a wait. Don't assume.
 *
 * THE GOLDEN RULE still applies: pre-register the wait BEFORE the action that triggers it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import type { Page, Response } from '@playwright/test';
import { UiApiFragments } from '../../enums/salesforce/salesforce-api';

const DEFAULT_TIMEOUT = 20_000;

interface WaitOptions {
  timeout?: number;
  /** Pin an exact status. Omit to match any — a 403 is still "the request completed". */
  status?: number;
}

/**
 * Wait for any UI API response whose URL contains `fragment`. The general escape hatch; prefer the
 * named helpers below. Pre-register BEFORE the trigger.
 */
export function waitForUiApi(
  page: Page,
  fragment: string,
  options: WaitOptions = {},
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, status } = options;
  return page.waitForResponse(
    (response) => {
      if (!response.url().includes(fragment)) return false;
      return status === undefined || response.status() === status;
    },
    { timeout },
  );
}

/**
 * Wait for a record to LOAD (GET ui-api/records). Optionally pin a specific record Id, which is
 * worth doing on a page that loads several records (related lists) so you don't resolve on the
 * wrong one.
 */
export function waitForRecordLoad(
  page: Page,
  recordId?: string,
  options: WaitOptions = {},
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT } = options;
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().includes(UiApiFragments.RECORDS) &&
      (recordId === undefined || response.url().includes(recordId)),
    { timeout },
  );
}

/**
 * Wait for a record SAVE — PATCH (update) or POST (create) against ui-api/records.
 *
 * Pair with an assertion on the RECORD, not only the toast: toasts auto-dismiss and will race you.
 *
 *   const saved = waitForRecordSave(page);
 *   await recordPage.save();
 *   await saved;
 *   await expect(recordPage.fieldValue('Account Name')).toContainText('Acme Corp');
 */
export function waitForRecordSave(page: Page, options: WaitOptions = {}): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, status } = options;
  return page.waitForResponse(
    (response) => {
      const method = response.request().method();
      if (method !== 'PATCH' && method !== 'POST') return false;
      if (!response.url().includes(UiApiFragments.RECORDS)) return false;
      return status === undefined || response.status() === status;
    },
    { timeout },
  );
}

/** Wait for object metadata to load — fires when a record page or form initializes. */
export function waitForObjectInfo(
  page: Page,
  objectApiName?: string,
  options: WaitOptions = {},
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT } = options;
  return page.waitForResponse(
    (response) =>
      response.url().includes(UiApiFragments.OBJECT_INFO) &&
      (objectApiName === undefined || response.url().includes(objectApiName)),
    { timeout },
  );
}

/** Wait for a list view's rows. Use after a refresh, a filter change, or a create. */
export function waitForListRecords(page: Page, options: WaitOptions = {}): Promise<Response> {
  return waitForUiApi(page, UiApiFragments.LIST_RECORDS, options);
}

/** Wait for a lookup/record-picker type-ahead search to return. */
export function waitForLookupSearch(page: Page, options: WaitOptions = {}): Promise<Response> {
  return waitForUiApi(page, UiApiFragments.LOOKUPS, options);
}

/**
 * LAST RESORT: wait for an Aura action by matching its POST payload.
 *
 * Only for screens that genuinely don't use the UI API. Treat every call site as a smell and leave
 * a comment saying why a ui-api wait wasn't possible. See `salesforce-waits`.
 *
 * @param actionMarker substring to find in the Aura request body, e.g. 'Account.Save'
 */
export function waitForAuraAction(
  page: Page,
  actionMarker: string,
  options: WaitOptions = {},
): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT } = options;
  return page.waitForResponse(
    (response) =>
      response.url().includes('/aura') &&
      (response.request().postData() ?? '').includes(actionMarker),
    { timeout },
  );
}
