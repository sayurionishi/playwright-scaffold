# Profile: salesforce

For Salesforce (Lightning Experience) orgs — sandboxes, scratch orgs, or production.

This profile is bigger than the others because Salesforce is not "a web app you test". It is a platform
where **your configuration is the system under test** and most of the UI is generated for you. Six
dedicated skills carry the detail; this file is the summary and the routing table.

## Skills in this pack

| Skill                          | Covers                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| `salesforce`                   | Hub. What to test, what NOT to test, the SUT seam, dos & don'ts |
| `salesforce-auth`              | JWT bearer, SFDX, session injection, MFA/SSO, per-persona state |
| `salesforce-locators`          | Lightning base-component locator cookbook + strict-mode traps   |
| `salesforce-waits`             | `/aura` vs `/ui-api`, toasts, spinners, inline edit, navigation |
| `salesforce-personas`          | Profile/permset matrix, FLS, CRUD, sharing, absence testing     |
| `salesforce-metadata-contract` | `describe` → Zod, drift detection, Apex REST, Platform Events   |
| `salesforce-data`              | Composite/Bulk record setup, cleanup, governor & API limits     |

## Locator priority

`getByRole` → `getByLabel` → `getByText` → `getByTestId`

`getByTestId` is **last**, not first: you cannot add `data-testid` to a standard Lightning component.
Where you own a custom LWC, adding one is encouraged — and then it jumps to the front _for that
component only_.

**Never** select on Lightning ids or classes. Ids are generated per render (`lightning-input-42`,
`combobox-button-7`) and `slds-*` classes are presentation utilities Salesforce restyles between
releases. Same trap as CSS-module hashing, different cause. See `salesforce-locators`.

## Waits

`networkidle` is a **hard refusal** on this profile, not a discouragement. Aura server actions, CometD
long-polling, and batched `/aura` XHRs mean the network never falls silent for the 500 ms `networkidle`
requires. The wait either hangs to timeout or resolves in a random gap between requests.

Use pre-registered waits on `/services/data/vXX.0/ui-api/*` (deterministic and greppable) or web-first
assertions. `/aura` **cannot be matched by URL alone** — every action batches through the same endpoint.
See `salesforce-waits`.

## Auth

**Do not automate the login form, and do not automate MFA.** Mint a session via the JWT bearer flow
(server-to-server, MFA-exempt by design) and inject it into the browser context. One `storageState` per
persona, produced by a parameterized setup project. See `salesforce-auth`.

## API contract

There is no OpenAPI spec. The contract is the org's own metadata:

- `/services/data/vXX.0/sobjects/<Object>/describe` — fields, types, nillable, picklist values, lengths
- `/services/data/vXX.0/ui-api/object-info/<Object>` — the same, plus the _effective_ permissions for
  the calling user. This is your FLS oracle.

Because that metadata is org state rather than committed source, **it drifts without a deploy**. Commit
a snapshot and assert against it (`@contract`). See `salesforce-metadata-contract`.

## Iframes and shadow DOM

- **Visualforce and Classic pages run in iframes** — `page.frameLocator(...)`. A Lightning page hosting
  a Visualforce component has _both_ DOM worlds on screen at once.
- **Lightning uses synthetic shadow DOM by default**, not native. Synthetic shadow is ordinary DOM with
  scoping attributes, so it behaves differently from the native shadow roots Playwright pierces
  automatically — and orgs that have enabled native shadow behave differently again. Don't build a
  strategy that depends on either; role and label engines work in both. See `salesforce-locators`.

## Projects enabled

`setup` (one run per persona), `functional`, `e2e`, `api` (record setup/teardown), and `org`
(metadata/contract checks, no browser).

## Notes

- **Never automate the Setup UI.** It's unstable across releases and unversioned. Use the Metadata API
  or the `sf` CLI instead.
- **Sandbox refreshes rename users** (`user@org.com.uat`) and wipe data. Keep the suffix env-driven.
- **Parallel workers share one org.** Namespace test data and mind the daily API request limit —
  `salesforce-data` covers the `/limits` guard.
- **API setup over UI clicking, always.** Creating an Account through the UI to test an Opportunity is
  three minutes of flake you don't need. One `composite/tree` call does it in 200 ms.
