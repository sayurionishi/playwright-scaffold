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

## The SUT seam — pick the cheapest layer that can fail

Salesforce lets the same behavior be verified at four levels. Choose the lowest one that actually
exercises your logic, because cost and flake rise steeply as you go up.

| Layer               | Use when                                                | Project      |
| ------------------- | ------------------------------------------------------- | ------------ |
| **Metadata**        | The risk is "did the config change?"                    | `org`        |
| **API (REST/Apex)** | The risk is in server logic — validation, Flow, trigger | `api`        |
| **UI functional**   | The risk is in _rendering/permission_ of one screen     | `functional` |
| **UI e2e**          | The risk is a multi-screen business journey             | `e2e`        |

A validation rule is server-side. It fires identically for a REST insert and a UI Save. Test it with a
REST insert asserting the `FIELD_CUSTOM_VALIDATION_EXCEPTION` — that's 200 ms and zero flake. Reserve a
UI test for the case where the _screen_ is the risk: does the error surface where the user can see it?

## Dos

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
