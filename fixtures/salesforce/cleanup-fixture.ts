import { test as orgTest } from './org-fixture';
import type { ApiRequest } from '@fixtures/api/api-request';
import { createRecord, createTree, deleteRecordQuietly, treeIds } from '@helpers/salesforce/soql';
import type { CompositeTreeResponse } from './schemas/salesforce-common.schema';

/**
 * Guaranteed record teardown for Salesforce tests.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS — `try/finally` IN A TEST BODY IS NOT A TEARDOWN MECHANISM
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The obvious pattern is wrong in the one case that matters most:
 *
 *     const created = await createRecord(adminOrg, 'Account', draft);
 *     try {
 *       … assertions …
 *     } finally {
 *       await deleteRecordQuietly(adminOrg, 'Account', created.id);   // ❌ may never run
 *     }
 *
 * When a test exceeds its timeout, Playwright does not throw *into* your test body — it abandons
 * the pending `await` and moves on. The `finally` block never executes, so the record leaks.
 *
 * That is precisely the wrong failure mode for this pack: a Lightning timeout is the single most
 * likely way these tests fail (Aura hydration, a spinner that never clears, a locator that never
 * resolves), so `try/finally` leaks orphan records exactly when leaking is most likely. Against a
 * shared sandbox those orphans accumulate silently for weeks, and they are why
 * `salesforceConfig.testDataPrefix` exists at all.
 *
 * FIXTURE teardown is the only teardown Playwright guarantees. Everything registered here is
 * deleted after `use()` returns, whether the test passed, failed, or timed out.
 *
 * ── ORDERING ──────────────────────────────────────────────────────────────────────────────────
 * Deletion is LIFO (most recently created first), so children are removed before their parents.
 * Salesforce cascade-deletes master-detail children with the parent, but NOT lookup children —
 * verify cascade behaviour for your own objects rather than assuming it (`salesforce-data`).
 *
 * ── ALWAYS AS ADMIN ───────────────────────────────────────────────────────────────────────────
 * Every delete goes through `adminOrg`. A restricted subject persona typically has no Delete, and
 * `deleteRecordQuietly` swallows errors by design — so cleanup as the subject would fail SILENTLY
 * and still look green. See `salesforce-personas`.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface RecordTracker {
  /**
   * Create one record as admin and register it for guaranteed teardown.
   * Drop-in replacement for `createRecord(adminOrg, …)` — same return value, minus the `finally`.
   */
  create<T extends object>(objectApiName: string, fields: T): Promise<{ id: string }>;

  /**
   * Create a parent + children hierarchy in one `composite/tree` call and register every created
   * record for teardown. Returns the raw response so `treeId(...)` still works.
   */
  createTree(rootObjectApiName: string, records: unknown[]): Promise<CompositeTreeResponse>;

  /**
   * Register a record this fixture did not create (e.g. one produced by a Flow or trigger during
   * arrange — see `salesforce-async`: automation creates side-effect records your delete must also
   * remove). Safe to call with an id you already tracked; duplicates are de-duplicated.
   */
  track(objectApiName: string, recordId: string): void;

  /** Ids registered so far, newest last. Useful in a failure message. */
  readonly tracked: ReadonlyArray<{ objectApiName: string; recordId: string }>;
}

export interface SalesforceCleanupFixtures {
  /** Create-and-forget: records registered here are always deleted, even on a test timeout. */
  trackedRecords: RecordTracker;
}

function makeTracker(adminOrg: ApiRequest): {
  tracker: RecordTracker;
  cleanup: () => Promise<void>;
} {
  const registry: Array<{ objectApiName: string; recordId: string }> = [];
  const seen = new Set<string>();

  function track(objectApiName: string, recordId: string): void {
    const key = `${objectApiName}:${recordId}`;
    if (seen.has(key)) return;
    seen.add(key);
    registry.push({ objectApiName, recordId });
  }

  const tracker: RecordTracker = {
    async create<T extends object>(objectApiName: string, fields: T) {
      const created = await createRecord(adminOrg, objectApiName, fields);
      track(objectApiName, created.id);
      return created;
    },

    async createTree(rootObjectApiName: string, records: unknown[]) {
      const response = await createTree(adminOrg, rootObjectApiName, records);
      // Register every created record, not just the root: `composite/tree` can mix objects, and a
      // lookup child would otherwise survive its parent's delete.
      for (const recordId of Object.values(treeIds(response))) {
        track(rootObjectApiName, recordId);
      }
      return response;
    },

    track,

    get tracked() {
      return registry;
    },
  };

  return {
    tracker,
    cleanup: async () => {
      // LIFO: children before parents. Best-effort per record, so one failure cannot strand the
      // rest — and cannot overwrite the assertion failure the test already reported.
      for (const { objectApiName, recordId } of [...registry].reverse()) {
        await deleteRecordQuietly(adminOrg, objectApiName, recordId);
      }
    },
  };
}

export const test = orgTest.extend<SalesforceCleanupFixtures>({
  trackedRecords: async ({ adminOrg }, use) => {
    const { tracker, cleanup } = makeTracker(adminOrg);
    await use(tracker);
    await cleanup();
  },
});
