---
name: salesforce-metadata-contract
description: Use when generating Zod schemas for Salesforce sObjects, detecting metadata drift an admin caused, pinning the API version, or testing Apex REST / Composite / Platform Event payloads. Salesforce has no OpenAPI — describe is the contract. Tag @contract.
---

# Salesforce Metadata Contract — describe IS the spec

Extends `api-testing` (whose Phase 2 says "OpenAPI is the source of truth") and `type-safety`. Salesforce
ships no OpenAPI document for standard data access, so the contract comes from the org itself.

Tag these tests **`@contract`**.

## Why this is a first-class test type here

On a normal backend, the API contract changes when someone merges a PR. In Salesforce, it changes when an
admin clicks Save in a browser. No deploy, no commit, no review, no notification.

```
Admin marks Margin__c required
  → next morning: 40 UI tests fail on "Save button disabled"
  → 3 hours of debugging that looks like a Playwright problem
```

A committed metadata snapshot turns that into **one** failing test named "Opportunity contract drift"
with a diff showing exactly what changed. That is the highest-leverage thing in this entire pack.

## What the contract layer covers (all of it, not just shape)

`tests/salesforce/contract/` is where every assertion about **shape** and **permissions** lives. It is
cheap enough to be exhaustive, so make it exhaustive:

| Dimension  | Asserted                                                                                                                                                  | Spec                     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| **Shape**  | field types, max lengths, nillable, picklist VALUES, restricted-picklist, reference targets, unique/externalId, precision/scale, record types, key prefix | `field-contract.spec.ts` |
| **Drift**  | normalized `describe` snapshot, pinned API version still supported                                                                                        | `metadata-drift.spec.ts` |
| **Grants** | permission-set assignments (EXACT), profile, role, no ViewAll/ModifyAll on non-admins                                                                     | `permissions.spec.ts`    |
| **CRUD**   | createable / updateable / deletable / queryable, per persona                                                                                              | `permissions.spec.ts`    |
| **FLS**    | per-persona visible + editable + required, per field                                                                                                      | `permissions.spec.ts`    |
| **Leaks**  | the EXACT visible-field set per persona                                                                                                                   | `permissions.spec.ts`    |

**None of this belongs in the UI.** "The Stage picklist offers six values" through a browser costs
~20s, needs a session, breaks on a locator change, and covers one field. Here it's one API call
covering every field, failing with the field name in the message. See
`docs/salesforce/TEST-ARCHITECTURE.md`.

## The contract is DATA, not code

`test-data/salesforce/contracts/` holds typed contract objects; one spec iterates them. Adding a field
or a persona is a single row, so coverage is something you **read** rather than audit.

```ts
export const AccountContract: ObjectContract = {
  object: 'Account',
  keyPrefix: '001',
  fields: [
    { name: 'Name', type: 'string', length: 255, nillable: false },
    { name: 'OwnerId', type: 'reference', nillable: false, referenceTo: ['User'] },
    // picklist VALUES are the highest-value thing to pin — Apex and Flows branch on them
    { name: 'Type', type: 'picklist', picklistValues: ['Customer', 'Partner'] },
  ],
  crudByPersona: {
    standardUser: { createable: true, updateable: true, deletable: false, queryable: true },
  },
  fieldAccessByPersona: { limitedFields: { AnnualRevenue: { visible: false, editable: false } } },
  visibleFieldsByPersona: { limitedFields: ['Id', 'Name' /* … */] },
};
```

**Only assert what you depend on.** Every entry will (correctly) fail a build when an admin changes it,
so an over-specified contract is a maintenance tax. Types and picklist values are almost always worth
pinning; labels never are (translators change them, nothing breaks).

Assertion helpers live in `helpers/salesforce/contract.ts` and use `expect.soft` for per-field checks,
so **one run reports every drifted field**. Fixing 12 fields across 12 red runs is how teams start
ignoring contract tests.

## Which endpoint answers which question

- **`describe`** — org-wide shape. Read it with **`adminOrg`**: read as a restricted persona it omits
  fields that persona can't see, which looks identical to fields being deleted from the org.
- **`ui-api/object-info`** — the same metadata _as the calling user sees it_, resolving profile +
  permission sets + muting. Read it with **`orgAs(persona)`**. This is the FLS/permission oracle.

Using the wrong one is the most common mistake in this layer.

## The two metadata endpoints

| Endpoint                       | Gives you                                       | Use for              |
| ------------------------------ | ----------------------------------------------- | -------------------- |
| `/sobjects/<Object>/describe`  | Full field metadata, org-wide                   | Schema generation    |
| `/ui-api/object-info/<Object>` | Same + **effective permissions for the caller** | FLS / persona checks |

`describe` is the shape. `object-info` is the shape _as this user sees it_. Use `describe` to generate
schemas, `object-info` to assert permissions (`salesforce-personas`).

## Generating schemas — never hand-write them

`scripts/generate-sobject-schemas.ts` reads `describe` and emits Zod. Run it at bootstrap and whenever
you add an object:

```bash
npm run sf:schemas -- Account Contact Opportunity
```

It writes `fixtures/salesforce/schemas/generated/<object>.schema.ts` (the Zod schema) and
`<object>.snapshot.ts` (the drift-check snapshot). **Generated files are committed** — that's the
whole point: the commit is the snapshot, and `git diff` after a re-run is your drift report.

**The snapshot is keyed by environment.** Testing more than one org (dev, staging, …)? Dev and
staging sandboxes routinely have different metadata shapes for reasons that aren't drift — an
unrefreshed sandbox, a field that landed in dev but hasn't deployed to staging yet. One snapshot per
object, keyed by `ENVIRONMENT`, means running against a different org never produces a false failure:

```bash
ENVIRONMENT=dev     npm run sf:schemas -- Account   # writes/updates the "dev" entry
ENVIRONMENT=staging npm run sf:schemas -- Account   # writes/updates "staging" — "dev" untouched
```

The generator reads the existing file back and merges before writing, so regenerating one
environment never clobbers another's committed shape. `tests/salesforce/contract/metadata-drift.spec.ts`
picks `snapshotByEnv[salesforceConfig.environment]` at runtime. Single-org setups can ignore all of
this — it just works with one key. See `docs/salesforce/TEST-ARCHITECTURE.md` §"Multi-environment".

The type mapping it applies:

| Salesforce `type`               | Zod                                  |
| ------------------------------- | ------------------------------------ |
| `string`, `textarea`, `phone`   | `z.string().max(length)`             |
| `email`                         | `z.string().email()`                 |
| `url`                           | `z.string().url()`                   |
| `id`, `reference`               | `SalesforceIdSchema` (15 or 18 char) |
| `boolean`                       | `z.boolean()`                        |
| `int`                           | `z.number().int()`                   |
| `double`, `currency`, `percent` | `z.number()`                         |
| `date`                          | `z.string().date()`                  |
| `datetime`                      | `z.string().datetime()`              |
| `picklist`                      | `z.enum([...picklistValues])`        |
| `multipicklist`                 | `z.string()` (semicolon-delimited)   |
| `nillable: true`                | `.nullable()`                        |

Two things that mapping buys you for free:

- **Picklist values become an enum.** An admin adding or removing a value fails the contract test — and
  that's often a genuine break, since Apex and Flows branch on those values.
- **`max(length)`** turns a shortened text field into a caught change rather than a truncation bug.

## The drift test

`tests/salesforce/metadata-contract.spec.ts`. Two complementary assertions:

```ts
test(
  'Opportunity metadata matches the committed snapshot',
  { tag: '@contract' },
  async ({ org }) => {
    const { data } = await org.get(SalesforceApi.describe('Opportunity'), {
      schema: DescribeResultSchema,
    });
    const live = normalizeDescribe(data); // strip volatile keys (urls, etc.)
    expect(live).toEqual(OpportunitySnapshot); // committed
  },
);
```

`normalizeDescribe` exists because `describe` includes fields that change for uninteresting reasons
(instance URLs, ordering). Normalizing keeps the test about _contract_ change, not noise. Anything you
normalize away is a thing you're choosing not to guard — keep the list short and justified.

### When the drift test fails

It is **a bug to triage, never a schema to loosen** (Constitution #7, #13). Three legitimate outcomes:

1. **Intentional change** — the admin's change was planned. Re-run the generator, review the diff like
   code, commit the new snapshot. The diff _is_ the change record.
2. **Unintentional change** — someone broke the contract. File it. Leave the test red.
3. **Different org** — your snapshot came from a different sandbox. Snapshots are per-org-shape; a Full
   sandbox and a scratch org will differ. Keep snapshots per-environment if they legitimately diverge.

What you never do is edit the generated schema by hand to make it pass.

## Pin the API version, and assert the pin

```ts
// config/salesforce.config.ts
apiVersion: process.env.SF_API_VERSION ?? 'v62.0',
```

Salesforce ships three releases a year and each adds a version. An unpinned version means your contract
moves under you. But a _stale_ pin eventually falls out of the supported window (Salesforce retires old
versions), so assert it:

```ts
test('pinned API version is still supported', { tag: '@contract' }, async ({ org }) => {
  const { data } = await org.get('/services/data/', { schema: VersionListSchema });
  expect(data.map((v) => `v${v.version}`)).toContain(salesforceConfig.apiVersion);
});
```

That fails loudly with an actionable message instead of every request 404ing mysteriously.

## Namespaced fields in managed packages

A managed-package field is `acme__Widget_Count__c` in one org and may be installed under a different
namespace elsewhere. Never hardcode the namespace — resolve it, or read the field list from `describe`
and match on the un-namespaced suffix. This is rule #15 at its sharpest.

## Apex REST endpoints

Custom Apex REST (`/services/apexrest/...`) is your own code, so normal `api-testing` rules apply in
full: `z.strictObject`, full status matrix, per-field negatives. Differences to know:

- Errors come back as an **array**: `[{ message, errorCode }]`, not a single object.
- Unhandled Apex exceptions surface as `500` with the exception name in `message`.
- Governor limits produce real failures under load — `LIMIT_EXCEEDED` / `System.LimitException`. If a test
  hits one, that's a finding about the Apex, not a test to retry.
- There's no generated spec. If the team maintains one (ApexDoc, an External Services registration), use
  it; otherwise capture the live shape and **flag it in the proposal** as unverified.

## Composite and Graph API

```
POST /services/data/vXX.0/composite          — up to 25 subrequests, ordered, referenceable
POST /services/data/vXX.0/composite/tree     — one object hierarchy, up to 200 records
POST /services/data/vXX.0/composite/batch    — independent subrequests, no chaining
POST /services/data/vXX.0/composite/graph    — multiple graphs, all-or-nothing per graph
```

The trap: **`composite` returns `200` even when subrequests failed.** The per-subrequest
`httpStatusCode` is where the truth lives. A test that only asserts the outer status is a false green.

```ts
const { data } = await org.post(SalesforceApi.COMPOSITE, {
  data: body,
  schema: CompositeResponseSchema,
});
for (const sub of data.compositeResponse) {
  expect(sub.httpStatusCode, `subrequest ${sub.referenceId}`).toBeLessThan(300);
}
```

`allOrNone: true` makes the whole thing transactional — use it for setup so a partial failure doesn't
leave half a hierarchy behind.

## Platform Events and Change Data Capture

Event payloads are also `describe`-able (`/sobjects/Order_Placed__e/describe`), so generate schemas the
same way. Subscribing needs CometD/Pub-Sub, which is outside Playwright's comfort zone — the pragmatic
test is: publish via REST, then assert the _downstream effect_ (the record the subscriber created).

```ts
await org.post(SalesforceApi.sobject('Order_Placed__e'), {
  data: makeOrderEvent(),
  expectStatus: 201,
});
// Event delivery is asynchronous — poll the effect with expect.poll, never a sleep.
await expect.poll(() => countTasksFor(accountId), { timeout: 30_000 }).toBeGreaterThan(0);
```

`expect.poll` is the right tool for genuinely async platform work: it retries on an interval with a
timeout and is not a blind sleep. Don't reach for `waitForTimeout` here.

## Don't

- Don't hand-write an sObject schema. Generate it.
- Don't use `z.object` — `strictObject`, always. An unexpected field is drift, and on a persona-scoped
  request it's an FLS regression.
- Don't loosen a schema to green a contract test.
- Don't hardcode a managed-package namespace.
- Don't leave the API version unpinned, or pinned-and-unasserted.
- Don't trust a `composite` `200`. Check every subrequest's `httpStatusCode`.
- Don't `SELECT *` — there's no such thing in SOQL, and enumerating fields from `describe` keeps the
  query honest about what the contract covers.
- Don't read `describe` as a restricted persona — omitted fields look like deleted fields. Use `adminOrg`.
- Don't assert permissions with `describe` — it's org-wide. Use `ui-api/object-info` via `orgAs`.
- Don't assert field metadata through the UI. Wrong layer, 100× the cost, ambiguous failures.
- Don't over-specify the contract. Pin what you depend on; labels are not a contract.
- Don't hand-edit a generated snapshot to add another environment's entry — regenerate with
  `ENVIRONMENT=<name> npm run sf:schemas`, which merges correctly instead of guessing the shape.

## Checklist

- [ ] Shape read with `adminOrg`; per-persona permissions read with `orgAs`.
- [ ] Contract expressed as DATA in `test-data/salesforce/contracts/`, not hand-written tests.
- [ ] Schemas generated from `describe`, committed as the snapshot.
- [ ] A `@contract` drift test per object the suite depends on.
- [ ] `normalizeDescribe` exclusions short and justified.
- [ ] API version pinned AND asserted against `/services/data/`.
- [ ] Picklist enums present (drift on values is caught).
- [ ] Composite subrequest statuses asserted individually.
- [ ] Apex REST error shape treated as an array.
- [ ] Async platform effects awaited with `expect.poll`, never a sleep.
- [ ] Permission-set grants, object CRUD, per-persona FLS, and visible-field SETS all asserted here —
      not in the UI.
- [ ] Per-field checks use `expect.soft` so one run reports every drift.
