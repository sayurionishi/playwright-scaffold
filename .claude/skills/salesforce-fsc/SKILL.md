---
name: salesforce-fsc
description: Use when testing Salesforce Financial Services Cloud specifically — the FinServ__ managed-package objects (FinancialAccount, FinancialGoal, ReciprocalRole), households and group membership, householding roll-ups, namespaced field API names, and record-type-driven layouts per FSC persona. Load only when PROJECT.md records the fsc overlay; for core Salesforce use the salesforce skill.
---

# Salesforce FSC — the industry data model on top of core

Extends `salesforce`. Everything there holds — the two identities, `describe` as the contract, the
persona lattice, `ui-api` waits. This skill covers only what Financial Services Cloud adds on top:
a managed package with its own objects, relationships modelled as records, householding roll-ups,
and record-type-driven layouts.

**This is a second-tier overlay.** It is added by `bootstrap` only when you answer yes to "is this
Financial Services Cloud?", so a Salesforce project that is not FSC pays nothing for it.

> **Person Accounts are NOT here.** They live in `salesforce-data`, because they are a core
> platform feature that any B2C org can enable — retail, nonprofit, healthcare — not an FSC one.
> FSC consumer orgs do use them heavily, so read that section first; it is the trap most likely to
> break a naive "create an Account".

## The `FinServ__` managed package

> **FSC is a managed package, and the package-shaped rules are not FSC-specific.** Namespace
> resolution, package automation firing during arrange, admin-only teardown, "a missing derived
> value may be missing config rather than bad timing", and "don't test that the package works —
> test your configuration of it" all live in **`salesforce-metadata-contract`** §"Testing a managed
> package", because they apply equally to nCino, Vlocity, Veeva and Conga. Read that first; this
> skill only adds what is specific to the FSC **data model**.

The one thing worth repeating here: almost every field you want is namespaced, so the
never-hardcode-the-prefix rule (#15) bites far more often on FSC than on a stock org.

| Concept                                         | Object (typical)                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| Financial account (deposit / loan / card)       | `FinServ__FinancialAccount__c`                                    |
| Financial goal                                  | `FinServ__FinancialGoal__c`                                       |
| Household / group                               | `Account` with a household record type + `FinServ__` group fields |
| Group membership                                | `AccountContactRelation` / `FinServ__*` join objects              |
| Reciprocal roles (relationships between people) | `FinServ__ReciprocalRole__c`                                      |
| Roll-ups by household                           | driven by `FinServ__RollupByLookup__c` configuration              |

Two consequences follow, and both change how you write the test:

- **Householding roll-ups are asynchronous AND config-driven.** A household's total assets is a
  derived value produced by `RollupByLookup` configuration, so assert it by polling, never off the
  member insert. See `salesforce-async`. And because it is _configuration_, a roll-up that does not
  appear may be a missing config row rather than a timing problem — check the config before
  raising a timeout.
- **Relationships are records, not fields.** "Jane is the spouse of John" is a reciprocal-role
  record with a role and its inverse. Arranging one direction leaves the org in a state a real user
  cannot reach, so **arrange both directions** — or your assertion about what John can see is
  testing a half-built graph.

## Record types and layouts drive everything

FSC personas (banker, adviser, teller) commonly see **different record types, with different page
layouts, picklist values and required fields, on the same object**. That means:

- **Pin the record type explicitly** in arrange. Do not let the test inherit whichever record type
  the running user happens to default to — that silently makes the same test exercise different
  layouts for different personas, and it fails for one persona only, months later.
- Put the **persona × record-type × visible-field matrix at the contract layer** (`org` project,
  `salesforce-personas`), not in the UI. It is dozens of combinations; through the UI it is dozens
  of page loads and an ambiguous failure when one is missing (FLS? layout? record type?).

## Arrange and teardown

- Households and relationships create **graphs** of records. Prefer `composite/tree` to build a
  parent plus its children in one call, and batch-delete on teardown. This is the FSC-specific part.
- Admin-only teardown and package automation firing during arrange apply to every managed package —
  see `salesforce-metadata-contract` §"Testing a managed package".

## Don't

- Don't hardcode a `FinServ__` API name or a record-type Id — resolve from metadata (rule #15).
- Don't assert a household roll-up immediately after adding a member — it is async and
  config-driven.
- Don't arrange only one side of a reciprocal relationship.
- Don't test that the FinServ package works. Test **your configuration of it** — record types,
  layouts, FLS, validation rules, roll-up configuration. If the test would pass on a vanilla FSC
  org with none of your customisation, delete it (`salesforce`).

## Checklist

- [ ] `FinServ__*` object and field names resolved from `describe`, not literals.
- [ ] Record type pinned explicitly in arrange, never inherited from the running user.
- [ ] Household / relationship graphs arranged via `composite/tree`, both reciprocal directions set.
- [ ] Roll-up and other derived household values asserted with `expect.poll`.
- [ ] Persona × record-type × visible-field matrix asserted at the contract layer, not the UI.
- [ ] Teardown runs as admin and includes automation-created child records.
