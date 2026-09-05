---
name: salesforce-data
description: Use when creating or cleaning up Salesforce org records for a test — Composite Tree hierarchies, Bulk API, unique naming against duplicate rules, teardown fixtures, governor limits, and the daily API request cap. Covers running tests safely against a shared sandbox.
---

# Salesforce Data — API setup, always

Extends `data-strategy` (Faker factories for happy-path, static tiers for invalid input) and `fixtures`
(setup/teardown lifecycle). This skill covers the Salesforce-specific parts: how to make records, how to
get rid of them, and how not to exhaust the org.

## Two rules

> **1. Never create a record through the UI unless the creation flow itself is the system under test.**
>
> **2. Arrange and tear down as System Admin (`adminOrg`) — never as the persona under test.**

Rule 2 is the one that bites quietly. A restricted persona has no Delete, so teardown as the subject
"succeeds" (`deleteRecordQuietly` swallows errors on purpose, so cleanup never masks a real assertion
failure) and data leaks into the sandbox for weeks. Admin also can't be blocked by FLS or sharing, so
setup is deterministic.

The mirror of rule 2: **never ASSERT with `adminOrg`.** Modify All Data bypasses sharing and FLS, so
the assertion passes even with the permission model broken. See `salesforce-personas`.

Clicking through New → fill → Save to get an Account so you can test an Opportunity costs ~30 seconds and
imports every Lightning flake into a test that isn't about Accounts. One `composite/tree` call does it in
~200 ms with a deterministic result.

## Choosing the right API

| Need                                            | Use                       | Limit                 |
| ----------------------------------------------- | ------------------------- | --------------------- |
| One record                                      | `POST /sobjects/<Object>` | 1                     |
| A parent + children hierarchy, one call         | `composite/tree`          | 200 records, 5 levels |
| Several dependent calls, referencing each other | `composite`               | 25 subrequests        |
| Several independent calls                       | `composite/batch`         | 25 subrequests        |
| Thousands of rows                               | Bulk API 2.0              | async, job-based      |

For test setup, `composite/tree` is the workhorse. Bulk API is for volume fixtures (a 10k-row list view
test), and it's asynchronous — poll the job with `expect.poll`, never a sleep.

### Composite Tree hierarchy

```ts
const tree = {
  records: [
    {
      attributes: { type: 'Account', referenceId: 'acct1' },
      Name: accountName,
      Contacts: {
        records: [{ attributes: { type: 'Contact', referenceId: 'con1' }, LastName: 'Rivera' }],
      },
    },
  ],
};
const { data } = await org.post(SalesforceApi.compositeTree('Account'), {
  data: tree,
  schema: CompositeTreeResponseSchema,
});
expect(data.hasErrors).toBe(false);
```

`referenceId` is how children bind to parents and how the response maps back to what you created.
**`hasErrors` is the field that matters** — like `composite`, the outer HTTP status can be `200` while
individual records failed. Asserting only the status is a false green.

## Unique naming — duplicate rules will bite you

Most real orgs have Duplicate Rules on Account and Contact/Lead. A factory that produces "Acme Corp"
twice gets a `DUPLICATES_DETECTED` error on the second run, or worse, silently blocks in a Flow.

Bake uniqueness into the factory, and prefix so test data is identifiable and bulk-deletable:

```ts
export function makeAccount(overrides: Partial<AccountDraft> = {}): AccountDraft {
  return {
    Name: `${TEST_PREFIX}${faker.company.name()} ${uniqueSuffix()}`,
    ...overrides,
  };
}
```

`TEST_PREFIX` (e.g. `PWT-`) means a human can find and purge orphans with one list view filter. That
matters more than it sounds — orphaned test data accumulates in shared sandboxes until someone's report
is wrong.

The suffix must be unique **across parallel workers**, not just across tests. Worker index plus a
per-process counter is deterministic and collision-free; a bare timestamp is not, because two workers can
hit the same millisecond.

## Teardown that actually runs

Register cleanup in a fixture so it runs even when the test fails:

```ts
export const test = base.extend<SalesforceDataFixtures>({
  seededAccount: async ({ org }, use) => {
    const created = await org.post(SalesforceApi.sobject('Account'), {
      data: makeAccount(),
      schema: CreateResponseSchema,
      expectStatus: 201,
    });
    await use(created.data);
    // Best-effort delete — never mask the test's own failure.
    await org.delete(SalesforceApi.sobjectById('Account', created.data.id)).catch(() => {});
  },
});
```

Points that matter:

- **Delete children before parents**, or rely on cascade delete from the parent (Salesforce cascades to
  master-detail children and to some lookup children — verify for your objects rather than assuming).
- **Deletes go to the Recycle Bin**, and they still count against storage. For high-volume suites, hard
  delete via Bulk API with `hardDelete` — which requires the "Bulk API Hard Delete" permission.
- **Swallow teardown errors.** A cleanup failure must not overwrite the real assertion failure.
- **Don't rely on teardown alone.** In a shared sandbox, add a scheduled purge of `TEST_PREFIX` records;
  killed CI runs leak.

## Shared org, parallel workers

`fullyParallel: true` against one sandbox creates contention that looks like flake:

- **Record locking.** Two workers updating the same parent (or the same Account's child rows) hit
  `UNABLE_TO_LOCK_ROW`. Fix: give each test its own data. Never share a fixture record across tests that
  write to it.
- **Roll-up summary recalculation** locks the parent while it recomputes — the same symptom, arriving from
  a direction you didn't touch.
- **Sequential-only tests** — anything touching org-wide config or a shared record — must be serialized:
  `test.describe.configure({ mode: 'serial' })`, and tag `@destructive`.

Scratch orgs are the real fix: one per CI run, no contention, no leakage. Recommend them when the team can
adopt them.

## Limits — the two that will actually stop you

### Daily API request limit

Org-wide, resets on a rolling 24h window, and shared with every integration in the org. A test suite that
burns it takes production integrations down with it — this is the one Salesforce limit with real blast
radius beyond your tests.

Guard it in setup rather than discovering it mid-run:

```ts
const { data } = await org.get(SalesforceApi.LIMITS, { schema: LimitsSchema });
const daily = data.DailyApiRequests;
if (daily.Remaining < daily.Max * 0.1) {
  throw new Error(`Aborting: only ${daily.Remaining}/${daily.Max} API requests left in the org.`);
}
```

Fail fast and loud. A suite that half-runs on an exhausted org produces failures that look like
application bugs.

### Governor limits

Per-transaction limits on the _Apex_ side (SOQL queries, DML rows, CPU time). You don't control them from
a test, but you will trigger them — and when you do, it's **a finding about the code under test, not a
test to retry**. `LIMIT_EXCEEDED` / `System.LimitException` in a response is a bug report.

Bulk-sensitive Apex is worth testing deliberately: insert 200 records in one call and assert the trigger
still behaves. That's a real test that finds real bugs.

## Static vs dynamic data (same as generic)

- **Factories** (`test-data/salesforce/factories/`) — dynamic happy-path drafts, unique per call.
- **Static** (`test-data/static/`) — curated invalid/boundary values: over-length strings for a
  `max(length)` field, invalid picklist values, malformed dates, an Id that's the right shape but doesn't
  exist. `.ts` with `as const`, never `.json` (rule #12).

Salesforce-specific boundary values worth curating: a 15-char Id where an 18-char is expected (both are
valid — good positive case), an Id from a _different_ object type (`003...` where `001...` is expected),
and a picklist value that was valid before an admin removed it.

## Don't

- Don't create setup records through the UI.
- Don't arrange or tear down as the subject persona — use `adminOrg`.
- Don't assert with `adminOrg` — it bypasses the rules you're testing.
- Don't reuse a fixed record name — duplicate rules will fail you on the second run.
- Don't trust `200` from `composite`/`composite/tree`. Check `hasErrors` / per-subrequest status.
- Don't let teardown errors mask test failures.
- Don't share a mutable record between parallel tests.
- Don't retry a governor-limit failure. File it.
- Don't run a write-heavy suite without the `/limits` guard.
- Don't hardcode record Ids. They're org-specific and sandbox refreshes change them.
- Don't write to production.

## Checklist

- [ ] Setup via API (`composite/tree` for hierarchies), not the UI.
- [ ] Arranged and torn down with `adminOrg`; assertions made as the subject persona.
- [ ] Names unique across parallel workers and prefixed with `TEST_PREFIX`.
- [ ] Teardown in a fixture, errors swallowed, children before parents.
- [ ] `hasErrors` / subrequest statuses asserted.
- [ ] No mutable record shared between parallel tests; serial + `@destructive` where needed.
- [ ] `/limits` guard in place for write-heavy runs.
- [ ] Invalid/boundary values in `test-data/static/`, not in the factory.
