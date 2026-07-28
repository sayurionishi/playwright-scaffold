# Salesforce test architecture

Which layer asserts what, which identity does it, and — the part most suites get wrong — what must
**not** be asserted at each layer.

---

## 1. The two identities

This is the most consequential rule in the pack. Salesforce testing has two distinct identities and
conflating them produces two silent failure modes.

|                        | Identity                  | Fixture                                       | Job                                                                                |
| ---------------------- | ------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| **Arrange / teardown** | System Admin (`sysAdmin`) | `adminOrg`                                    | Create records, delete records, read org-wide metadata, query the permission model |
| **Act / assert**       | The persona under test    | `org`, `orgAs(key)`, `page`, `asPersona(key)` | Perform the behaviour, make the assertions                                         |

**Why arrange must be admin.** A restricted persona has no Delete. Teardown as the subject fails
quietly (`deleteRecordQuietly` swallows it, by design, so cleanup never masks a real failure) and
data leaks into the sandbox for weeks. Admin also can't be blocked by FLS or sharing, so setup is
deterministic.

**Why assertions must NOT be admin.** "Modify All Data" bypasses sharing _and_ field-level security.
An assertion made as admin passes even when the permission model is completely broken. That's worse
than having no test — it reports safety that isn't there.

The fixtures enforce what they can: `orgAs()` throws for a privileged persona, and `adminOrg` throws
if `SF_ADMIN_PERSONA` isn't marked `privileged` in `personas.ts`.

```ts
test('a user can edit and it persists', async ({ page, adminOrg }) => {
  const created = await createRecord(adminOrg, 'Account', makeAccount()); // ARRANGE as admin
  try {
    // ACT + ASSERT as the subject persona — `page` carries the restricted user's session
  } finally {
    await deleteRecordQuietly(adminOrg, 'Account', created.id); // TEARDOWN as admin
  }
});
```

---

## 2. The four layers

| Layer             | Project      | Browser | Identity                                   | Asserts                                                                                                                                                   |
| ----------------- | ------------ | ------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contract**      | `org`        | no      | `adminOrg` (shape) + `orgAs` (permissions) | Field types, lengths, nillable, picklist values, reference targets, record types, permission-set grants, object CRUD, per-persona FLS, visible-field sets |
| **API behaviour** | `api`        | no      | `orgAs` / `adminOrg`                       | Server-side logic: validation rules, Flows, triggers, Apex REST contracts                                                                                 |
| **UI functional** | `salesforce` | yes     | subject persona                            | One screen's behaviour; whether the screen _honours_ the permission model                                                                                 |
| **UI e2e**        | `salesforce` | yes     | subject persona                            | One multi-screen business journey, end to end                                                                                                             |

The rule for choosing: **pick the lowest layer that can actually fail.** A validation rule fires
identically for a REST insert and a UI Save, so test it with a REST insert — 200 ms, zero flake.
Reserve the UI test for the case where the _screen_ is the risk: does the error surface where the
user can see it?

---

## 3. Contract layer — what belongs here

Everything about **shape** and **permissions**. This layer is cheap enough to be exhaustive, so make
it exhaustive.

```
tests/salesforce/contract/
  metadata-drift.spec.ts    normalized describe snapshot + API version pin
  field-contract.spec.ts    types · lengths · nillable · picklist values · references · record types
  permissions.spec.ts       permission-set grants · object CRUD · per-persona FLS · visible-field sets
```

The contract itself is **data**, not code (`test-data/salesforce/contracts/`). Adding a field or a
persona is one row, so coverage is something you read rather than audit.

### Why these assertions do not belong in the UI

| Assertion                         | In the UI                                                         | At the contract layer                                   |
| --------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| Stage picklist offers 6 values    | ~20s, needs a session, breaks on a locator change, covers 1 field | 1 API call, every field, fails with the field name      |
| Rep can't see 8 restricted fields | 8 page loads, ambiguous absence                                   | 1 call, unambiguous, plus set-difference leak detection |
| Field is 255 chars                | not observable                                                    | direct                                                  |
| Permission set is assigned        | not observable                                                    | direct                                                  |

**Absence in the UI is ambiguous** — FLS, page layout, record type, or a collapsed section all look
identical. The API tells you _which_.

### Three assertions worth calling out

**Grants, not just effects.** `object-info` says the persona can't edit the field; it doesn't say
why. When an admin unassigns a permission set, six FLS tests go red for a reason that looks
unrelated. Asserting `PermissionSetAssignment` directly turns that into one failure naming the set.
Permission drift _is_ contract drift.

**Exact permission-set match, not "contains".** An _extra_ permission set is a privilege escalation
— the more dangerous direction, and the one a "must contain" check misses entirely.

**Visible-field sets.** The strongest assertion in the pack. Field-by-field checks only cover fields
you thought to list, so when an admin adds `Commission_Rate__c` and it defaults to visible for every
profile, nothing fails. An exact-set comparison fails immediately, and reports "newly visible"
separately because that's the leak direction. Generate with `npm run sf:visible-fields`.

---

## 4. UI layer — behaviour only

```
tests/salesforce/ui/
  record-behaviour.spec.ts   workflows · persistence · permission model AS RENDERED
```

**Belongs here:**

- Does the workflow complete? (edit → save → _actually persisted server-side_)
- Does the screen **honour** the model the contract layer verified? Lightning can render a field
  from a cached layout even when the API denies it — that's a rendering question, so it lives here.
  **One** test, not a matrix.
- Does a validation rule or Flow surface its error where the user can see it?
- Does the multi-step journey hold together?

**Does not belong here:** field types, lengths, picklist values, per-field FLS matrices, permission
set assignments. Already covered, cheaper, more precisely.

### Absence assertions need a positive control

```ts
// The control proves the locator is right. Without it, the negative test passes when the
// locator is wrong, the page didn't load, or the label changed.
await expect(fullAccessRecord.fieldValue('Annual Revenue')).toBeVisible(); // control
await expect(limitedRecord.fieldValue('Annual Revenue')).toBeHidden(); // the restriction
```

**The control must not be an admin.** An admin sees the field via Modify All Data even when the
permission set that's supposed to grant it is broken. Use the least-privileged persona that _should_
have access — that's what `fullAccess` is for.

---

## 5. The persona lattice

Personas differ from their neighbour along **exactly one** axis, so a failing matrix cell tells you
which axis broke. A persona differing on three axes at once produces failures you debug rather than
read.

| Persona           | CRUD            | FLS             | Sharing               | UI     | Purpose  | Isolates                           |
| ----------------- | --------------- | --------------- | --------------------- | ------ | -------- | ---------------------------------- |
| `sysAdmin`        | all + ModifyAll | all             | bypasses              | yes    | arrange  | — never asserted                   |
| `fullAccess`      | CRUD+D          | all fields      | normal                | yes    | control  | grant correctness, no admin bypass |
| `standardUser`    | CRU, no D       | all fields      | normal                | yes    | subject  | the realistic default              |
| `limitedFields`   | CRU, no D       | **some hidden** | normal                | yes    | subject  | **FLS**                            |
| `readOnly`        | **R only**      | all fields      | normal                | yes    | subject  | **CRUD**                           |
| `noAccess`        | **none**        | none            | normal                | yes    | boundary | **the deny path**                  |
| `manager`         | CRU             | all             | **above** subordinate | yes    | control  | **sharing** (sees down)            |
| `subordinate`     | CRU             | all             | **below** manager     | yes    | subject  | **sharing** (can't see up)         |
| `integrationUser` | CRUD (API)      | all             | normal                | **no** | boundary | **UI axis**                        |

Read the pairs:

- `fullAccess` → `limitedFields`: same CRUD, fewer fields → a failure is **field-level**
- `fullAccess` → `readOnly`: same fields, no write → a failure is **object-level**
- `manager` ↔ `subordinate`: identical CRUD and FLS → a failure is **sharing**
- anything → `noAccess`: proves deny assertions can fail at all

`noAccess` earns its place by making the deny path real. A suite full of "restricted user cannot X"
may be passing vacuously — wrong locator, failed request, wrong object. `noAccess` is the hard floor.

`integrationUser` is `uiCapable: false`, so the setup fan-out skips it (no UI licence). "This
integration identity cannot also log into the browser" is a genuine security assertion — integration
users often carry broad API grants nobody audits.

---

## 6. Ratio guidance

Cost per test differs by roughly two orders of magnitude, so the shape follows:

| Layer         | Count                                    | Runs                   |
| ------------- | ---------------------------------------- | ---------------------- |
| Contract      | exhaustive — every field × every persona | every push             |
| API behaviour | one per rule / Flow / endpoint           | every push             |
| UI functional | a handful per screen — behaviour only    | every push (or per PR) |
| UI e2e        | a few per critical journey               | nightly / pre-release  |

If your UI test count is growing faster than your contract test count, assertions are at the wrong
layer.

---

## 7. Anti-patterns

| Anti-pattern                                  | Why it's wrong                                                    |
| --------------------------------------------- | ----------------------------------------------------------------- |
| UI tests running as System Admin              | Tests a screen no user sees; bypasses sharing and FLS             |
| Teardown as the subject persona               | No Delete → silent cleanup failure → leaked data                  |
| An admin as the positive control              | Passes via Modify All Data even with the permset broken           |
| Absence assertion with no control             | Passes when the locator is wrong — a false green about _security_ |
| A persona × field matrix in the UI            | 20 minutes and flaky for what one API call does in seconds        |
| Asserting picklist values through the browser | Slow, covers one field, breaks on locator change                  |
| `permissionSets` asserted as "contains"       | Misses privilege escalation, the dangerous direction              |
| Field-by-field FLS with no exact-set check    | Misses newly-added fields — how leaks ship                        |
| Testing that a Lightning list view sorts      | That's Salesforce's test, not yours                               |
| Loosening a schema to green a contract test   | Deletes the only signal you had (rules #7, #13)                   |
| Hardcoding a record Id                        | Org-specific; sandbox refreshes change them                       |
| Retrying a governor-limit failure             | It's a bug in the code under test                                 |

---

## 8. Commands

```bash
npm run test:contract     # @contract — shape + version pin  (org project, no browser)
npm run test:personas     # @persona  — grants, CRUD, FLS, visible-field sets
npm run test:salesforce   # UI behaviour as the subject persona
npm run sf:schemas -- Account Opportunity         # regenerate shape snapshots
npm run sf:visible-fields -- Account Opportunity  # regenerate per-persona visible-field sets
```

Both generators write output you **review like code and commit**. The diff is the drift report.
