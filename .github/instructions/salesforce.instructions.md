---
applyTo: '**/salesforce/**'
---

# Salesforce / Lightning (mirror of the `salesforce*` skills)

<!-- BEGIN GENERATED: rules — edit rules/constitution.ts, run npm run rules:generate -->

- **Rule #15** — A Salesforce object or field API name written from memory. Read it from `describe` / `ui-api/object-info` (`salesforce-metadata-contract`)

<!-- END GENERATED: rules -->

Active only on the `salesforce` profile (recorded in `PROJECT.md`). This file exists because the
Copilot surface previously carried **no Salesforce guidance at all** while the Claude side had seven
dedicated skills — so Copilot users got none of the rules below, which are the ones that cause
silent false passes rather than loud failures.

## What to test, and what to leave alone

- **Don't test Salesforce. Test your configuration of Salesforce.** The falsifiable tell: if the
  test would still pass on a brand-new org with zero customisation, it is testing the platform —
  delete it.
- **Layer it.** Field types, lengths, picklist VALUES, permission-set grants, object CRUD and
  per-persona FLS belong in the `org` project (no browser, dozens of combinations in seconds). The
  `salesforce` UI project asserts **behaviour only** — workflows, persistence, and whether the
  screen honours the model the contract layer already verified. Asserting field metadata through
  the UI costs ~100x and is ambiguous when it fails (FLS? page layout? record type?).

## Two identities, never one

- `adminOrg` **arranges and tears down**. It has Modify All Data so cleanup can never be blocked.
- The subject persona (`org`, `orgAs(key)`, or the UI `page`) **acts and asserts**.
- Arranging as a restricted user means teardown silently cannot delete, and data leaks for weeks.
  **Asserting as an admin is worse**: Modify All Data bypasses sharing and FLS, so the test passes
  with the permission model completely broken. UI projects default to `standardUser`, never admin.
- An absence assertion needs a **positive control that is not an admin** — an admin sees the field
  via Modify All Data even when the grant is broken, so it proves nothing.

## Auth is org auth, not a login form

- Use the JWT bearer flow to mint a session; never drive the Lightning login UI, and never automate
  an MFA challenge. One `storageState` per persona, namespaced by environment.

## `describe` is the contract

- Salesforce ships no OpenAPI, and an admin can rename or delete a field with no deploy and no
  commit. So field and object API names are **org state, not source** — read them from
  `describe` / `ui-api/object-info`, never from memory (rule #15). `Margin__c` existing in someone
  else's org proves nothing about yours.
- Drift detection is a first-class test type, tagged `@contract`.
- `z.strictObject` doubles as the FLS oracle: FLS **omits** fields from a REST response rather than
  erroring, so a strict schema turns a silently-hidden field into a failure.

## Waits

- `networkidle` is a **hard refusal** here, not a discouragement — Aura never goes quiet.
- You cannot wait on `/aura` by URL. Wait on the specific `ui-api` response that gates your next
  action, and pre-register the wait BEFORE the click.
- Lightning renders the shell before components hydrate, so prefer `toBeEnabled()` over
  `toBeVisible()` on a control you are about to click.
- A `201`/save response is **not** final state: after-save Flows, `@future`/Queueable/Batch Apex,
  Platform Events and roll-up recalculation all land afterwards. Never assert a rollup or formula
  value straight off the create response — re-query with `expect.poll`.

## Locators

- Priority: `getByRole` → `getByLabel` → `getByText` → `getByTestId`. testId is **last** here,
  because you cannot add `data-testid` to a standard Lightning component.
- Never use a generated id or an `slds-*` class — both change between releases.
- A Lightning combobox is not a `<select>`, so `selectOption()` silently does nothing.
- The highlights panel duplicates field values, so scope to the Details region or you get a
  strict-mode violation. Scope it — do not reach for `.first()`.

## Data

- Prefer `composite/tree` to build a parent + children in one call. It returns HTTP 200 even when
  individual records failed — check `hasErrors`, or you have a false green.
- Register every created record for **fixture-scope** teardown (`trackedRecords`). A `try/finally`
  in the test body does not run when the test times out, which is the most likely way a Lightning
  test fails.
- Automation fires during arrange even as admin: expect side-effect records, and delete them too.
- Namespace test data (`salesforceConfig.testDataPrefix`) so a human can purge orphans, and to
  clear duplicate/matching rules.
