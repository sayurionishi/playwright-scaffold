---
name: salesforce-async
description: Use when a Salesforce test asserts record state right after a create or update and it is flaky or intermittently wrong — after-save Flows, @future/Queueable/Batch Apex, Platform Events, roll-up summary and formula recalculation. Covers why a 201 is not final state and what to wait on instead. Salesforce profile only; for generic waiting use wait-strategy.
---

# Salesforce Async — a `201` is not final state

Extends `wait-strategy` (level 4, `expect.poll`). Everything there still holds; this is the
Salesforce-specific reason you need it constantly rather than occasionally.

The trap that catches everyone: the API returns `201 Created`, you assert the record, and it is
wrong one run in five. The insert **succeeded** — but the work it _triggered_ had not finished when
you read back. Salesforce runs a whole order of execution after a DML commit, and several parts of
it are asynchronous: they complete after your call has already returned.

This is the single largest cause of flake in a Salesforce suite, and it does not look like a timing
bug. It looks like a data bug, which is why people "fix" it by re-running.

## What fires after your create returns

| Mechanism                          | Timing                                                      | What it changes                           |
| ---------------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| Before/after-save Flows, triggers  | synchronous (same transaction)                              | the record and related records            |
| Validation rules                   | synchronous                                                 | rejects the write outright                |
| Roll-up summary fields             | recalculated on the parent, **not always** same transaction | parent totals and counts                  |
| Formula fields                     | computed **on read**, never stored                          | nothing — do not assert them as persisted |
| `@future` / Queueable / Batch Apex | asynchronous, seconds later                                 | anything                                  |
| Platform Events / CDC subscribers  | asynchronous                                                | downstream records                        |
| Scheduled paths / Process Builder  | asynchronous, minutes later                                 | anything                                  |

So "create an Opportunity, then assert the Account's `Total_Opportunities__c` is 3" can pass or
fail depending on whether the rollup recalculated before your read. Nothing in the test is wrong.
The test is just asking a question the platform has not finished answering.

## The rule

**Never assert a derived value immediately after the write.** Either re-query until it settles, or
assert the _trigger_ of the async work rather than its _effect_.

```ts
// ❌ races the async rollup
const { id } = await trackedRecords.create(
  SObjects.OPPORTUNITY,
  makeOpportunity(stage, { AccountId }),
);
const { data } = await adminOrg.get(SalesforceApi.sobjectById(SObjects.ACCOUNT, accountId), {
  params: { fields: 'Total_Opportunities__c' },
  schema: AccountRollupSchema,
});
expect(data.Total_Opportunities__c).toBe(3); // flaky

// ✅ poll the derived field until it reaches the expected value — bounded, not a sleep
await expect
  .poll(
    async () =>
      (
        await adminOrg.get(SalesforceApi.sobjectById(SObjects.ACCOUNT, accountId), {
          params: { fields: 'Total_Opportunities__c' },
          schema: AccountRollupSchema,
        })
      ).data.Total_Opportunities__c,
    { timeout: 15_000, intervals: [500, 1_000, 2_000] },
  )
  .toBe(3);
```

## Recipes

- **Roll-up / formula** — re-query with `expect.poll`; never read the value once. A formula field is
  computed on read, so assert it from a **fresh query**, not from the create response, which never
  contained it.
- **`@future` / Queueable side effect** — poll for the _record it should produce_ (or its `Id`), not
  a sleep. If you own the Apex, expose a status field to poll; if you do not, poll the resulting
  record.
- **Batch Apex** — query `AsyncApexJob` for the job's `Status = 'Completed'` before asserting its
  output. Asserting on a partially-processed batch is the same race, one layer down.
- **Platform Event downstream** — poll for the downstream record. Events have no synchronous ack
  you can await, so there is nothing else to wait on.
- **Validation rules are synchronous** — a `FIELD_CUSTOM_VALIDATION_EXCEPTION` comes back on the
  _insert_ call itself. That one you assert directly, with no polling. Do not reach for
  `expect.poll` out of habit.

## In the UI

The Lightning save (`ui-api/records` PATCH/POST) returns when the **synchronous** transaction
commits — the async tail still runs after. So if a UI assertion depends on an async result (a
rollup on the highlights panel, a related list populated by a Flow), waiting on the save response
is not enough. Wait on the specific `ui-api` read that reflects the new value, or re-open the
record. Do not assert on the first render.

## Don't

- Don't assert a rollup, formula, or derived value straight off the create/update response.
- Don't `waitForTimeout` to "let the job finish" — poll a real signal (`wait-strategy`,
  Constitution #1, and it is lint-blocked).
- Don't assume teardown is clean: async automation may have created child records your delete must
  also remove. Query for them and register them (`trackedRecords.track`), or they leak.
- Don't test the async engine itself — that Batch Apex runs, that Platform Events deliver. Test
  **your logic's outcome** (`salesforce`: don't test the platform, test your configuration of it).
- Don't raise the poll timeout to make a red test pass. A value that needs 30s to settle is a fact
  about the org worth knowing, not a number to bump (Constitution #13).

## Checklist

- [ ] No derived value asserted off the create/update response.
- [ ] `expect.poll` (bounded) used for rollups, formulas, and async side effects.
- [ ] Batch jobs gated on `AsyncApexJob.Status`, not on elapsed time.
- [ ] Formula fields read from a fresh query, never treated as persisted.
- [ ] Teardown accounts for records created by triggers and Flows, not just the one you inserted.
- [ ] Validation-rule failures asserted directly on the insert — no polling.
- [ ] No `waitForTimeout`; every wait targets a real signal.
