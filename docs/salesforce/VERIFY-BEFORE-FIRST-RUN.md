# Verify before first run — Salesforce pack

**Read this before you trust anything in the Salesforce pack.**

The pack was built without access to a live org. Everything in it is either (a) documented Salesforce
platform behavior, or (b) a pattern that is correct in general but **depends on your org's
configuration**. Category (b) needs confirming once, per org. This document is that list.

Nothing here is a known defect — it's the honest boundary between "documented" and "verified in your
org". Work through it during `bootstrap` Phase 3b step 6 and record the answers in `PROJECT.md`.

Legend: **BLOCKER** = nothing works until resolved · **CHECK** = verify, adjust if wrong ·
**FILL IN** = we deliberately shipped this empty rather than invent org data (Constitution #15).

---

## 1. Auth — BLOCKER

| #   | Item                                                                                                                   | How to verify                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1.1 | **Connected App exists** with digital signatures enabled and the cert uploaded                                         | Setup → App Manager → your app → View                      |
| 1.2 | **Connected App is assigned** to every test persona's Profile or a Permission Set they hold                            | Manage → Manage Profiles / Manage Permission Sets          |
| 1.3 | **Permitted Users = "Admin approved users are pre-authorized"**                                                        | Manage → Edit Policies                                     |
| 1.4 | `SF_LOGIN_URL` matches the org type — `test.salesforce.com` for sandboxes, `login.salesforce.com` for prod/Dev Edition | —                                                          |
| 1.5 | The private key in `SF_JWT_PRIVATE_KEY` matches the uploaded certificate                                               | Run `npm run sf:schemas -- Account`; a mismatch fails here |

1.2 is the step teams miss most often. Its symptom is `invalid_grant: user hasn't approved this
consumer` with no further detail.

**Fastest end-to-end check:** `npm run sf:schemas -- Account`. It authenticates, calls `describe`, and
writes a file — so success proves auth, the API version, and connectivity all at once.

## 2. Session injection into the browser — BLOCKER

The pack prefers `sid` **cookie injection** (`applySession`) over `frontdoor.jsp`. Both depend on org
settings, and which one works for you must be established once.

| #   | Item                                                                                        | Notes                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | **Run `npx playwright test --project=setup:salesforce`**                                    | This is the single most important check in this document. It asserts the App Launcher renders, so it fails loudly if injection didn't take. |
| 2.2 | **"Lock sessions to the IP address from which they originated"** — Setup → Session Settings | If ON and your API call and browser egress from different IPs, injection fails. Symptom: silent redirect to the login page.                 |
| 2.3 | If cookie injection fails, try `frontdoorUrl()`                                             | Note Salesforce has shipped release updates **restricting session ids passed to frontdoor.jsp** — treat it as a fallback with a shelf life. |
| 2.4 | The cookie domain is the **instance** host from the token response, not the Lightning host  | `applySession` derives this automatically — just don't override it with a constructed URL.                                                  |

If 2.1 fails, stop and fix it. Every UI test depends on it, and a broken session presents as a
confusing locator failure much later.

## 3. Locators — CHECK

The Lightning cookbook in `salesforce-locators` follows Salesforce's documented base-component
semantics. Markup still varies by release, by record type, and by whether the org has enabled native
shadow DOM. **Confirm each locator you actually use against live DOM** (playwright-cli `snapshot`)
before relying on it — Constitution #4.

Highest-risk items, in order:

| #   | Item                                                                           | Where                                            |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------ |
| 3.1 | `fieldValue(label)` — the region + listitem scoping for record detail fields   | `pages/salesforce/lightning-record.page.ts`      |
| 3.2 | Details region accessible name matches `/details/i` in your org's language     | same                                             |
| 3.3 | `editFieldButton` — the inline-edit pencil's accessible name pattern           | same                                             |
| 3.4 | App Launcher button name is exactly `App Launcher` (changes with org language) | `app-launcher.component.ts`, `personas.setup.ts` |
| 3.5 | Datatable exposes `role="grid"` on the surfaces you test                       | `datatable.component.ts`                         |
| 3.6 | Toast role — `status` for success, `alert` for errors                          | `toast.component.ts`                             |

**Non-English orgs:** every accessible name above is localized. If your org runs in another language,
these patterns need translating — that's a real change, not a tweak.

## 4. Waits — CHECK

| #   | Item                                                                  | Notes                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | **Do the screens you test actually use the UI API?**                  | Watch the network on a record save. If you see `/ui-api/records` — good. If only `/aura`, the named wait helpers won't fire and you need `waitForAuraAction` (a documented smell) or a DOM-signal wait. |
| 4.2 | Aura-era and managed-package components are the usual offenders       | Check per screen; don't generalize from one.                                                                                                                                                            |
| 4.3 | `expect` timeout of 10s and 20s wait defaults suit your org's latency | Full sandboxes are slower than scratch orgs.                                                                                                                                                            |

4.1 is the one genuine "this might not apply to you" in the whole pack.

## 5. Metadata & contract — FILL IN

| #   | Item                                                                                                                                                      | Action                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1 | **No schemas are generated yet**                                                                                                                          | `npm run sf:schemas -- Account Contact Opportunity` (plus your objects), then commit                                                                                                                                                                                       |
| 5.2 | `OBJECTS_UNDER_CONTRACT` in `tests/salesforce/contract/metadata-drift.spec.ts` is empty                                                                   | Register the generated `<Object>SnapshotByEnv` maps. A guard test fails until you do.                                                                                                                                                                                      |
| 5.3 | `SF_API_VERSION` default is `v62.0` — **almost certainly not what you want**                                                                              | Set it to a version your org supports; `test:contract` asserts it                                                                                                                                                                                                          |
| 5.4 | Managed-package namespaces                                                                                                                                | Never hardcode. Resolve from `describe`.                                                                                                                                                                                                                                   |
| 5.5 | Testing more than one environment/org                                                                                                                     | Already handled: `npm run sf:schemas` keys the committed snapshot BY ENVIRONMENT and merges rather than overwrites. Run it once per environment (`ENVIRONMENT=staging npm run sf:schemas -- Account`) — nothing else to do. See `docs/salesforce/TEST-ARCHITECTURE.md` §6. |
| 5.6 | `.auth/<env>/` and the generated schema/snapshot files are per-environment, but `test-data/salesforce/contracts/*.contract.ts` (CRUD/FLS/personas) is NOT | That file represents one environment's permission model by default. If yours genuinely diverge across environments, see the escape hatch in `contract-types.ts`'s doc comment.                                                                                             |

## 6. Personas — FILL IN

| #   | Item                                                                      | Action                                                                                                                          |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 6.1 | `test-data/salesforce/personas.ts` ships **example** personas             | Replace with your org's real ones. Profile/permset names are org state — read them from the org.                                |
| 6.2 | One org user + one `SF_USERNAME_<KEY>` env var per persona                | See `env/.env.salesforce.example`                                                                                               |
| 6.3 | `FIELD_ACCESS` in `tests/salesforce/fls-matrix.spec.ts` is **empty**      | Add a real restricted field (API name from `describe`). We shipped no `Margin__c` because inventing one would violate rule #15. |
| 6.4 | The `OBJECT_ACCESS` expectations match your real permission model         | They currently describe the example personas.                                                                                   |
| 6.5 | Every persona test pairs an absence assertion with a **positive control** | The rule that makes these tests meaningful — `salesforce-personas`                                                              |

## 7. Data & limits — CHECK

| #   | Item                                                                     | Notes                                                                                     |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 7.1 | **Are Duplicate Rules active** on Account/Contact/Lead?                  | If so, `uniqueName()` is load-bearing, not cosmetic.                                      |
| 7.2 | Do validation rules require fields the factories don't set?              | Factories use standard fields only; a required custom field will 400.                     |
| 7.3 | `Opportunity.StageName` — `makeOpportunity` requires you to pass a value | Deliberate: the picklist is org-configurable. Read valid values from `describe`.          |
| 7.4 | Does cascade delete cover your objects?                                  | Master-detail cascades; lookups vary. Verify rather than assume.                          |
| 7.5 | Is `TEST_PREFIX` (`PWT-`) right for your org's conventions?              | It's how humans find orphans.                                                             |
| 7.6 | Add a scheduled purge of `TEST_PREFIX` records in shared sandboxes       | Killed CI runs leak data; teardown alone isn't enough.                                    |
| 7.7 | `fullyParallel: true` against a shared sandbox                           | Expect `UNABLE_TO_LOCK_ROW` if tests share parent records. Scratch orgs are the real fix. |

## 8. Environment — CHECK

| #   | Item                                                                           | Notes                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1 | `BASE_URL` is your **Lightning** host, with no path segment                    | A path here breaks `goto('/')`                                                                                                                                                                      |
| 8.2 | The API instance host is **not** configured — it comes from the token response | Correct by design; don't add an env var for it                                                                                                                                                      |
| 8.3 | `SF_USERNAME_SUFFIX` set after a sandbox refresh                               | Refresh appends the sandbox name to every username                                                                                                                                                  |
| 8.4 | Never point this at production                                                 | If forced to, `@destructive`-tag every write and gate it                                                                                                                                            |
| 8.5 | Testing multiple environments (dev, staging, …)                                | `env/.env.salesforce.example`'s content needs merging into EACH `env/.env.<environment>` file you use — values differ per org even though the variable names stay the same. See its header comment. |

---

## Minimum path to a first green run

```bash
# 1. Auth + connectivity + API version, all in one (uses the admin persona)
npm run sf:schemas -- Account

# 2. Browser session injection — the critical one. Fans out over every UI-capable persona.
npx playwright test --project=setup:salesforce

# 3. Contract layer: shape + version pin
npm run test:contract

# 4. Contract layer: grants, CRUD, FLS
npm run test:personas

# 5. Generate the leak-detection sets, review, commit
npm run sf:visible-fields -- Account

# 6. One UI behaviour test
npx playwright test --project=salesforce -g "a user can view a record created via the API"
```

If step 1 fails → section 1. Step 2 → section 2 (and check every persona has a real org user).
Step 4 → section 6. Step 6 → sections 3 and 4.

Steps 3–5 need no browser and are fast, so they belong on every push. Step 6 is the slow layer.

Record what you found in `PROJECT.md` under "Target-specific facts", so the next person (or the next
AI session) doesn't rediscover it.
