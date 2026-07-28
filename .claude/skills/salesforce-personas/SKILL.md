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

## Personas as data

`test-data/salesforce/personas.ts`:

```ts
export const Personas = {
  salesRep: { key: 'salesRep', profile: 'Sales User', permissionSets: [] },
  salesManager: {
    key: 'salesManager',
    profile: 'Sales User',
    permissionSets: ['Margin_Visibility'],
  },
  readOnly: { key: 'readOnly', profile: 'Read Only', permissionSets: [] },
} as const;
```

Each persona needs its own org user and its own env-provided username. One `storageState` per persona
comes from the fan-out setup project (`salesforce-auth`).

`profile` and `permissionSets` are documentation of _intent_ — the test asserts the org actually matches.
Don't write the names from memory; read them from the org.

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
- Don't infer effective access from a profile name — assert it from `object-info`.
- Don't loosen a strictObject schema to make an FLS test pass. That's the test working (rule #7).
- Don't reuse one persona's browser context or org client for another persona.
- Don't try to distinguish "no sharing access" from "not found". Salesforce won't tell you, by design.
- Don't put a 30-row matrix in the UI. API layer, then a few UI spot-checks.
- Don't hardcode permission set or profile names from memory (rule #15 in spirit — they're org state).

## Checklist

- [ ] Every absence assertion paired with a positive control.
- [ ] Effective permissions read from `ui-api/object-info`, not assumed.
- [ ] Persona schemas are `strictObject` listing exactly the visible fields.
- [ ] Object/record denial asserted by status code (`403`/`404`/`400`).
- [ ] Matrix lives at the API layer; UI tests only where rendering is the risk.
- [ ] Record type pinned where layouts differ.
- [ ] One `storageState` / org client per persona, never shared.
- [ ] Tagged `@persona` (or `@security`), exactly one tag.
