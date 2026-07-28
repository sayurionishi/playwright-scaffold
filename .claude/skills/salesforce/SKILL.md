---
name: salesforce
description: Use as the hub for any Salesforce (Lightning) testing work — deciding what is worth testing in an org, what to leave alone, and which Salesforce skill to load next. Covers the platform dos and don'ts. Load this first when PROJECT.md profile is `salesforce`.
---

# Salesforce — the hub

Load this first for Salesforce work. It answers _what_ to test; the six sibling skills answer _how_.

| Need                                    | Skill                          |
| --------------------------------------- | ------------------------------ |
| Get authenticated / past MFA            | `salesforce-auth`              |
| Locate a Lightning element              | `salesforce-locators`          |
| Make it wait reliably                   | `salesforce-waits`             |
| Test permissions, FLS, sharing          | `salesforce-personas`          |
| Detect metadata drift; generate schemas | `salesforce-metadata-contract` |
| Create/clean up records                 | `salesforce-data`              |

## The one rule that matters most

> **Don't test Salesforce. Test your configuration of Salesforce.**

Salesforce has tens of thousands of engineers regression-testing the platform every release. When you
write a test that a list view sorts by column, or that a lookup field opens a search dialog, you have
volunteered to maintain a test that will break on Salesforce's schedule and never once find your bug.

| Test this (yours)                                   | Not this (Salesforce's)         |
| --------------------------------------------------- | ------------------------------- |
| A validation rule blocks a bad Close Date           | Required-field asterisks render |
| A Flow creates the follow-up Task it should         | The Flow _engine_ runs          |
| Apex assigns the right discount tier                | `Database.insert` inserts       |
| A permission set grants exactly the intended access | Profiles exist                  |
| Your custom LWC handles an empty result set         | `lightning-datatable` paginates |
| A page layout exposes the fields the role needs     | Page layouts are assignable     |
| An integration's Apex REST endpoint contract holds  | The REST API returns JSON       |

The tell: if the test would still pass on a brand-new org with zero customization, it's testing the
platform. Delete it.

## THE TWO IDENTITIES (get this right before anything else)

Salesforce testing has two distinct identities, and conflating them causes two silent failures.

|                        | Identity               | Fixture                                   | Job                                                                    |
| ---------------------- | ---------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| **Arrange / teardown** | System Admin           | `adminOrg`                                | Create + delete records, org-wide metadata, query the permission model |
| **Act / assert**       | the persona under test | `org`, `orgAs(k)`, `page`, `asPersona(k)` | Perform the behaviour, make the assertions                             |

- **Arrange must be admin.** A restricted persona has no Delete, so teardown fails quietly and data
  leaks. Admin also cannot be blocked by FLS or sharing, so setup is deterministic.
- **Assertions must NOT be admin.** "Modify All Data" bypasses sharing _and_ FLS, so the assertion
  passes even when the permission model is completely broken. That is worse than having no test — it
  reports safety that is not there.

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

The fixtures enforce what they can: `orgAs()` throws for a privileged persona, and `adminOrg` throws
if `SF_ADMIN_PERSONA` is not marked `privileged` in `personas.ts`. UI projects default to
`standardUser`, never admin.

## The SUT seam — pick the cheapest layer that can fail

Full detail in `docs/salesforce/TEST-ARCHITECTURE.md`. Choose the lowest layer that actually
exercises your logic; cost and flake rise steeply as you go up.

| Layer             | Project      | Asserts                                                                                                                                            | Never asserts                           |
| ----------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Contract**      | `org`        | Field types, lengths, nillable, picklist VALUES, references, record types, permission-set grants, object CRUD, per-persona FLS, visible-field sets | —                                       |
| **API behaviour** | `api`        | Server logic: validation rules, Flows, triggers, Apex REST                                                                                         | field metadata                          |
| **UI functional** | `salesforce` | One screen's behaviour; whether the screen _honours_ the permission model                                                                          | types, picklist values, FLS matrices    |
| **UI e2e**        | `salesforce` | One multi-screen journey                                                                                                                           | anything the layers below already cover |

**UI = behaviour. Contract = shape and permissions.** "The Stage picklist offers six values" through a
browser costs ~20s, needs a session, breaks on a locator change, and covers one field. The same
assertion at the contract layer is one API call covering every field, and it fails with the field name
in the message. Absence in the UI is also ambiguous — FLS, page layout, record type, or a collapsed
section all look identical; the API tells you _which_.

A validation rule is server-side and fires identically for a REST insert and a UI Save. Test it with a
REST insert asserting `FIELD_CUSTOM_VALIDATION_EXCEPTION` — 200 ms, zero flake. Reserve a UI test for
when the _screen_ is the risk: does the error surface where the user can see it?

If your UI test count is growing faster than your contract test count, assertions are at the wrong
layer.

## Dos

- **Do arrange with `adminOrg` and assert with the subject persona.** The single most important rule
  in this pack — see above.
- **Do put shape and permission assertions in the contract layer**, and keep the UI for behaviour.
- **Do mint sessions via the API and inject them.** UI login is slow, MFA-gated, and the single largest
  source of Salesforce suite flake. `salesforce-auth`.
- **Do read field API names from `describe`.** Constitution rule #15. Org metadata is not source code.
- **Do treat `describe` drift as a test failure.** An admin renaming a field should break one loud
  `@contract` test, not forty UI tests next Tuesday.
- **Do create records via `composite/tree`.** Hierarchies in one call, and teardown is a batch delete.
- **Do test the permission model explicitly.** In most orgs it _is_ the deliverable. `salesforce-personas`.
- **Do pin your API version** and assert the org still supports it. Unpinned means Salesforce's three
  annual releases silently change your contract.
- **Do namespace test data** when workers share a sandbox. `salesforce-data`.
- **Do prefer `lightning/uiRecordApi` responses as wait signals** — unlike `/aura`, they're identifiable.

## Don'ts

- **Don't run UI tests as System Admin.** You'd be testing a screen no real user sees, with sharing
  and FLS bypassed. Subject persona always.
- **Don't tear down as the subject persona.** No Delete → silent cleanup failure → leaked data.
- **Don't use an admin as a positive control.** It passes via Modify All Data even when the permission
  set that's supposed to grant access is broken. Use the least-privileged persona that _should_ have it.
- **Don't put a persona × field matrix in the UI.** Twenty flaky minutes for what one API call does in
  seconds. Contract layer, then one UI spot-check where rendering is the risk.
- **Don't automate the Setup UI.** Unversioned, restructured between releases, and slower than the
  Metadata API doing the same job. Use `sf` CLI / Metadata API.
- **Don't automate an MFA challenge.** Not "it's hard" — it defeats the control and it will break. Use a
  JWT bearer session (MFA-exempt by design) or an exempt integration user.
- **Don't use `networkidle`.** Hard refusal on this profile. Aura never goes quiet.
- **Don't select on `slds-*` classes or `lightning-*-NNN` ids.** Regenerated per render, restyled per release.
- **Don't assert on a record Id you hardcoded.** Ids are org-specific and sandbox refreshes change them.
  Query or create the record.
- **Don't test in production.** And if you're forced to, `@destructive` everything that writes and gate
  it behind an explicit opt-in.
- **Don't assume a field's absence means no permission.** It may mean your locator is wrong. Absence
  assertions need a positive control — `salesforce-personas`.
- **Don't share one Playwright worker's session across personas.** Cross-contaminated state produces
  tests that pass alone and fail in the suite.
- **Don't let a `@contract` failure be "fixed" by loosening the schema.** That's rule #7/#13. File it.

## Org anatomy you need to know before writing anything

- **Object types.** Standard (`Account`, `Opportunity`) vs custom (`Invoice__c`). Custom fields always
  carry `__c`; relationships `__r` when traversed in SOQL. Managed-package objects carry a namespace
  (`acme__Widget__c`) — which means the _same_ logical field has a different API name in different orgs.
- **The permission stack.** License → Profile → Permission Set (+ Permission Set Group) → Muting →
  Sharing (OWD, roles, sharing rules, manual, Apex managed). Access is the _union_ of grants, restricted
  by sharing. This is why permissions must be tested as a matrix, not a checklist.
- **Record types + page layouts** determine which picklist values and fields a persona can even see. Two
  personas on the same object can face genuinely different forms.
- **Environments.** Scratch org (ephemeral, per-branch, ideal for CI), Developer/Partial/Full sandbox
  (refresh wipes data and renames users), Production (don't).

## Where the generic skills still apply unchanged

POM structure (`page-objects`), fixture DI (`fixtures`), tagging and spec shape (`test-standards`),
Zod discipline (`type-safety`), env/config (`config`), and the debugging loop (`debugging`) are all
unchanged. The Salesforce pack adds; it doesn't replace those.

## Checklist

- [ ] The behavior under test is _your_ config/code, not platform behavior.
- [ ] Tested at the lowest layer that can actually fail.
- [ ] No field/object API name written from memory (rule #15).
- [ ] Auth via injected session, not the login form.
- [ ] No `networkidle`, no `slds-*`/generated-id selectors.
- [ ] Records created and torn down via API, namespaced if the org is shared.
