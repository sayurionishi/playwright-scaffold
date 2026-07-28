---
name: salesforce-personas
description: Use when testing who can see or do what in Salesforce — profiles, permission sets, field-level security (FLS), object CRUD, record sharing, or record-type/layout differences. Covers the persona matrix and how to write absence assertions that can actually fail. Tag @persona.
---

# Salesforce Personas — permissions are the product

In most Salesforce orgs the permission model _is_ the deliverable. It is also the thing most suites don't
test, because "can the sales rep see the margin field?" doesn't look like a test until it leaks to the
wrong audience.

Tag these tests **`@persona`** (or `@security` when the framing is "this must not leak").

## The permission stack

Access is the **union** of grants, then narrowed by sharing:

```
License          → outer bound on what's even possible
Profile          → exactly one per user; baseline object + field access
Permission Sets  → additive grants (a user can hold many)
Permission Set Groups → bundles of the above, with Muting subtracting
─────────────────────────────────────────────────────────
Sharing: OWD → Role hierarchy → Sharing rules → Manual → Apex managed
```

Two consequences that shape how you test:

1. **You cannot infer access from a profile name.** A permission set can grant what the profile denies.
   Only the _effective_ permission for the actual user is the truth — which is why the assertion oracle
   is `ui-api/object-info` (calling-user aware), not `sobjects/describe`.
2. **Object access and record access are different questions.** A user can have Read on Opportunity
   (CRUD/FLS) and still not see _this_ Opportunity (sharing). Test both axes.

## The two identities (before anything else)

|                        | Identity               | Fixture                                   | Job                                   |
| ---------------------- | ---------------------- | ----------------------------------------- | ------------------------------------- |
| **Arrange / teardown** | System Admin           | `adminOrg`                                | Create + delete records, query grants |
| **Act / assert**       | the persona under test | `org`, `orgAs(k)`, `page`, `asPersona(k)` | Behaviour and assertions              |

An assertion made as an admin passes even when the permission model is completely broken — Modify All
Data bypasses sharing _and_ FLS. `orgAs()` throws for a privileged persona to stop this. Teardown, by
contrast, MUST be admin: a restricted persona has no Delete, so cleanup fails silently and leaks data.

## Personas as a LATTICE, not a list

Each persona differs from its neighbour along **exactly one** axis, so a failing matrix cell tells you
which axis broke. A persona differing on three axes at once produces failures you debug rather than read.

The four axes: **CRUD** (object-level) · **FLS** (field-level) · **SHARING** (which records) ·
**UI** (can it use a browser at all).

| Persona           | CRUD            | FLS             | Sharing               | UI     | Purpose  | Isolates                |
| ----------------- | --------------- | --------------- | --------------------- | ------ | -------- | ----------------------- |
| `sysAdmin`        | all + ModifyAll | all             | bypasses              | yes    | arrange  | — never asserted        |
| `fullAccess`      | CRUD+D          | all fields      | normal                | yes    | control  | grant correctness       |
| `standardUser`    | CRU, no D       | all fields      | normal                | yes    | subject  | the realistic default   |
| `limitedFields`   | CRU, no D       | **some hidden** | normal                | yes    | subject  | **FLS**                 |
| `readOnly`        | **R only**      | all fields      | normal                | yes    | subject  | **CRUD**                |
| `noAccess`        | **none**        | none            | normal                | yes    | boundary | **the deny path**       |
| `manager`         | CRU             | all             | **above** subordinate | yes    | control  | **sharing** (sees down) |
| `subordinate`     | CRU             | all             | **below** manager     | yes    | subject  | **sharing** (not up)    |
| `integrationUser` | CRUD (API)      | all             | normal                | **no** | boundary | **UI axis**             |

Read the pairs — this is the whole point:

- `fullAccess` → `limitedFields`: same CRUD, fewer fields → a failure is **field-level**
- `fullAccess` → `readOnly`: same fields, no write → a failure is **object-level**
- `manager` ↔ `subordinate`: identical CRUD and FLS → a failure is **sharing**
- anything → `noAccess`: proves deny assertions can fail at all

**`noAccess` earns its place** by making the deny path real. A suite full of "restricted user cannot X"
may be passing vacuously — wrong locator, failed request, wrong object. This is the hard floor.

**`integrationUser` is `uiCapable: false`**, so the setup fan-out skips it (no UI licence). "This
integration identity cannot also log into the browser" is a genuine security assertion — integration
users routinely carry broad API grants nobody audits.

`test-data/salesforce/personas.ts` carries `privileged`, `uiCapable`, `purpose`, and an `isolates`
note per persona. `profile`/`permissionSets`/`role` document INTENT — the contract layer asserts the
org actually matches, so those strings are checked, never trusted.

### Adding a persona

Ask: **which single axis does it isolate?** If the answer is "a few things", split it into two
personas. If the answer is "nothing the existing ones don't", don't add it.

Worth considering for your org: a Permission Set GROUP persona with **muting** (the subtlest part of
the stack), an Experience Cloud / partner community user (different licence and sharing model), or a
persona per record type where layouts genuinely diverge.

## THE RULE: absence assertions need a positive control

This is the single most important thing in this skill.

```ts
// ❌ WORTHLESS. Passes if the field is hidden, AND passes if your locator is wrong,
//    AND passes if the page didn't load, AND passes if the label changed.
test('rep cannot see margin', async ({ page }) => {
  await expect(page.getByLabel('Margin')).toBeHidden();
});
```

A negative assertion is satisfied by every kind of failure. It is the easiest false green in testing, and
in a permissions suite a false green means "we believe this is locked down" when it isn't.

Pair every absence with a presence, in the same file, on the same locator:

```ts
// ✅ The manager case proves the locator is correct. The rep case then means something.
test.describe('Margin field visibility', () => {
  test('manager sees margin', { tag: '@persona' }, async ({ asPersona }) => {
    const { recordPage } = await asPersona('salesManager');
    await recordPage.goto(accountId);
    await expect(recordPage.fieldValue('Margin')).toBeVisible(); // ← positive control
  });

  test('rep does not see margin', { tag: '@persona' }, async ({ asPersona }) => {
    const { recordPage } = await asPersona('salesRep');
    await recordPage.goto(accountId);
    await expect(recordPage.fieldValue('Margin')).toBeHidden();
  });
});
```

If the positive control breaks, both tests are suspect — which is exactly the signal you want.

### The control must NOT be an admin

The subtlest version of this mistake: your control passes because it's System Admin, so it sees the
field via Modify All Data even when the permission set that's supposed to grant it is broken. You've
proved nothing about the grant.

**The positive control must be the least-privileged identity that SHOULD have access** — that's what
`fullAccess` exists for. `orgAs()` and `assertAssertable()` refuse privileged personas outright.

### Where the matrix lives

Keep the persona × field matrix at the **contract layer** (`tests/salesforce/contract/`) — dozens of
combinations in seconds, no browser. Write a _small_ number of UI tests only where rendering is the
risk: Lightning can render a field from a cached layout even when the API denies it, and that's a
rendering question. **One** UI test with both halves in the same file, not a matrix.

## The API layer is the stronger oracle

UI absence has many causes (FLS, page layout, record type, a collapsed section). The API tells you _why_.

### FLS is silent, not an error

This is the trap that catches everyone: when you lack field access, Salesforce **omits the field** from
the REST response. No 403, no error — the field simply isn't there.

Which means `z.strictObject` is already your FLS assertion mechanism (Constitution #6 earning its keep):

```ts
// A schema of exactly what this persona SHOULD see. Extra field → fail. Missing field → fail.
const RepAccountSchema = z.strictObject({
  attributes: SObjectAttributesSchema,
  Id: SalesforceIdSchema,
  Name: z.string(),
  // Margin__c deliberately absent — if it appears, FLS regressed and strictObject catches it.
});
```

### `object-info` gives you effective permissions directly

```ts
const { data } = await org.get(SalesforceApi.objectInfo('Opportunity'), {
  schema: ObjectInfoSchema,
});
expect(data.fields['Margin__c']?.updateable).toBe(false);
expect(data.createable).toBe(true);
```

`object-info` is **calling-user aware** — it reflects profile + permsets + muting as actually resolved.
`sobjects/describe` is broadly similar but `object-info` is the one to trust for permission questions.

### Object CRUD denial does surface as an error

Unlike FLS, object-level and record-level denial are explicit:

| Attempt                       | Response                                                    |
| ----------------------------- | ----------------------------------------------------------- |
| No object Read                | `403` / `INSUFFICIENT_ACCESS`                               |
| No record access (sharing)    | `404` — deliberately indistinguishable from "doesn't exist" |
| No field edit (FLS) on update | `400` / `INVALID_FIELD_FOR_INSERT_UPDATE`                   |
| No object Delete              | `403` / `INSUFFICIENT_ACCESS_OR_READONLY`                   |

Note the `404`: Salesforce hides existence to avoid leaking it. So "record not visible" and "record not
found" look identical from outside — assert `404` and don't try to distinguish them.

### Record-level access, precisely

`UserRecordAccess` answers the sharing question directly:

```sql
SELECT RecordId, HasReadAccess, HasEditAccess, HasDeleteAccess
FROM UserRecordAccess
WHERE UserId = :userId AND RecordId = :recordId
```

Use this when the question is genuinely about sharing rules or the role hierarchy rather than FLS.

## Assert the GRANT, not only its effect

`object-info` tells you a persona _can't_ edit a field. It doesn't tell you **why**. So when an admin
unassigns a permission set, six FLS tests go red for a reason that looks unrelated to any of them.

Assert the assignment directly and that becomes one failure naming the set. **Permission drift IS
contract drift** — it happens with no deploy, no PR, and no notification.

```ts
const user = await requireUserByUsername(adminOrg, salesforceConfig.username('limitedFields'));
const assigned = await assignedPermissionSets(adminOrg, user.id);
expect(assigned).toEqual(['Restricted_Field_Visibility']); // EXACT, not "contains"
```

**Exact, not `contains`.** An _extra_ permission set is a privilege escalation — the more dangerous
direction, and the one a "must contain" check misses entirely.

Two gotchas the helpers handle for you (`helpers/salesforce/permissions.ts`):

- **Every Profile owns a hidden PermissionSet**, and it appears in `PermissionSetAssignment`. Without
  filtering `IsOwnedByProfile = false`, your assigned-sets list always carries a phantom entry and an
  exact comparison can never pass.
- **Assigned ≠ effective.** A set granted through a Permission Set _Group_ can be neutralised by
  **muting** on that group. If the grant assertion passes while the effect assertion fails, muting is
  the first thing to check.

Also assert **Role**, for the hierarchy personas: a changed role silently changes which _records_ the
persona sees, with no CRUD or FLS change to hint at it. And check `IsActive` — an inactive test user
produces auth failures that look exactly like Connected App misconfiguration.

## No unintended sharing bypass

`ViewAllRecords` / `ModifyAllRecords` on a **non-admin** persona is a silent, total bypass of the
sharing model. Every sharing test still passes; the persona simply sees everything.

This is the highest-severity permission misconfiguration in Salesforce and almost nobody tests for it:

```ts
const grants = await objectPermissionsFor(adminOrg, 'Account', persona.permissionSets);
for (const grant of grants) {
  expect.soft(grant.viewAll, `${grant.source} grants ViewAll to ${persona.key}`).toBe(false);
  expect.soft(grant.modifyAll, `${grant.source} grants ModifyAll to ${persona.key}`).toBe(false);
}
```

## The visible-field SET — the strongest assertion here

Field-by-field FLS assertions only cover fields **you thought to list**. So when an admin adds
`Commission_Rate__c` next quarter and it defaults to visible for every profile, nothing fails — nobody
asked about that field. That is precisely how field-level data leaks reach production.

An exact-set assertion inverts the default:

```ts
const info = await fetchObjectInfo(await orgAs('limitedFields'), 'Account');
assertVisibleFieldSet(info, 'limitedFields', AccountContract.visibleFieldsByPersona.limitedFields);
```

A **newly visible** field fails immediately. `assertVisibleFieldSet` reports "newly visible" separately
from "no longer visible", because the first is the leak direction and needs triaging first.

Cost: every legitimate schema change updates these lists. That's the correct trade — the failure is
loud, one line to fix, and reviewed. Generate them with `npm run sf:visible-fields -- Account`.

## The matrix shape

Drive persona × capability as data so coverage is visible and adding a persona is one line:

```ts
const MATRIX = [
  { persona: 'salesManager', field: 'Margin__c', visible: true, editable: true },
  { persona: 'salesRep', field: 'Margin__c', visible: false, editable: false },
  { persona: 'readOnly', field: 'Name', visible: true, editable: false },
] as const;

for (const row of MATRIX) {
  test(
    `${row.persona}: ${row.field} visible=${row.visible}`,
    { tag: '@persona' },
    async ({ orgAs }) => {
      const org = await orgAs(row.persona);
      const { data } = await org.get(SalesforceApi.objectInfo('Opportunity'), {
        schema: ObjectInfoSchema,
      });
      expect(Boolean(data.fields[row.field])).toBe(row.visible);
      if (row.visible) expect(data.fields[row.field]?.updateable).toBe(row.editable);
    },
  );
}
```

**Keep the matrix at the API layer.** It runs in the `api`/`org` project with no browser: dozens of
persona × field combinations in seconds. Then write a _small_ number of UI tests for the cases where the
screen itself is the risk.

## Record types and layouts

Two personas on the same object can face genuinely different forms — different fields, different picklist
values, different required-ness. So a persona test must pin the record type, or it's testing whichever
default the user happens to have:

```ts
const { data } = await org.get(SalesforceApi.objectInfo('Opportunity'), {
  schema: ObjectInfoSchema,
});
const rtId = Object.values(data.recordTypeInfos).find(
  (rt) => rt.name === 'Enterprise',
)?.recordTypeId;
```

Restricted picklists also vary per record type — a value valid for one persona may be rejected for another.

## Don't

- Don't write an absence assertion without a positive control in the same file.
- Don't use an ADMIN as the positive control — it passes via Modify All Data with the grant broken.
- Don't assert with `adminOrg`, and don't tear down with the subject persona.
- Don't infer effective access from a profile name — assert it from `object-info`.
- Don't loosen a strictObject schema to make an FLS test pass. That's the test working (rule #7).
- Don't reuse one persona's browser context or org client for another persona.
- Don't try to distinguish "no sharing access" from "not found". Salesforce won't tell you, by design.
- Don't put a 30-row matrix in the UI. Contract layer, then a few UI spot-checks.
- Don't assert permission sets with `contains` — an extra set is privilege escalation.
- Don't rely on field-by-field FLS alone; without an exact visible-field SET, new fields leak silently.
- Don't forget `IsOwnedByProfile = false` when querying PermissionSetAssignment.
- Don't hardcode permission set or profile names from memory (rule #15 in spirit — they're org state).

## Checklist

- [ ] Arranged with `adminOrg`; asserted as a non-privileged persona.
- [ ] Every absence assertion paired with a positive control that is NOT an admin.
- [ ] Effective permissions read from `ui-api/object-info`, not assumed.
- [ ] Persona schemas are `strictObject` listing exactly the visible fields.
- [ ] Object/record denial asserted by status code (`403`/`404`/`400`).
- [ ] Matrix lives at the contract layer; UI tests only where rendering is the risk.
- [ ] Permission-set grants asserted EXACTLY (profile-owned sets filtered out).
- [ ] Role asserted for hierarchy personas; ViewAll/ModifyAll asserted absent for non-admins.
- [ ] An exact visible-field SET committed per persona (catches newly-added fields).
- [ ] Record type pinned where layouts differ.
- [ ] One `storageState` / org client per persona, never shared.
- [ ] Tagged `@persona` (or `@security`), exactly one tag.
