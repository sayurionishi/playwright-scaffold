# Target fit — what this scaffold can and cannot test

A one-page answer to "we have _X_ to test; is this the right repo?" Read it before `bootstrap`,
not after.

The honest summary: this is a **browser + HTTP** scaffold. Everything it is good at follows from
that, and so does everything it cannot do.

---

## 1. Good fit — use this repo

| Target                                  | Profile      | Notes                                                                                       |
| --------------------------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| Public / third-party web app            | `generic`    | Locator order role → label → placeholder → text → testId. The default.                      |
| Web app whose source you control        | `controlled` | You can add `data-testid`, so testId goes first. The most stable option.                    |
| Salesforce Lightning org                | `salesforce` | Set `SF_LOGIN_URL`. Tier 2 = 8 skills. Works for Sales, Service, custom apps, any vertical. |
| Salesforce + a managed package          | `salesforce` | nCino, Vlocity, Veeva, Conga → `salesforce-metadata-contract` §"Testing a managed package". |
| Salesforce Financial Services Cloud     | `salesforce` | Tier 2 **plus** `salesforce-fsc`. Record `fsc: true` in `PROJECT.md`.                       |
| API calls that seed/clean state for UI  | any          | The `api` project + the `apiRequest` fixture exist for exactly this.                        |
| Modest API-as-SUT sharing types with UI | any          | Worth staying only for the shared Zod schemas and fixtures. See §2 if it grows.             |

A Salesforce org **and** a custom web app in one suite is supported and not obvious: the two
project sets are gated by different env vars (`SF_LOGIN_URL` and `TEST_USER_EMAIL`), so they
coexist without interfering.

---

## 2. Wrong repo — go here instead

| Target                                | Go to                                                                                                                                                             |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The API itself is the SUT**         | **`sayurionishi/api-testing-scaffold`** — Python (pytest+httpx+Pydantic v2) or TS (Vitest+Zod). Same methodology, no browser tooling. See `profiles/api-only.md`. |
| **Load / performance testing**        | **k6** or **Gatling**. Playwright measures one browser, not throughput.                                                                                           |
| Contract testing from an OpenAPI spec | **Schemathesis** or **Dredd** — property-based, generated from the spec.                                                                                          |

The line between this repo and the API one is what the calls are _for_, not which tool makes them:
seeding state for UI tests → stay here; the endpoint is the thing under test → go there.

---

## 3. Not supported today — and what it would actually take

These are honest gaps, not refusals in principle. Playwright can do some of them; **this scaffold
has no path for them**, and `bootstrap` will not pretend otherwise.

### Electron / desktop apps

Playwright supports Electron via `_electron.launch()`, and **most of this scaffold would transfer
unchanged** — the Page Object Model, fixture DI, the wait strategy, Zod validation, the whole
Constitution. What does not transfer is the entry point:

- every UI project is `devices['Desktop Chrome']` and assumes a browser context;
- `baseURL`, `page.goto()` and `storageState` all assume a URL;
- `helpers/auth/auth.setup.ts` assumes a login **page**.

So it is a real port — a new profile, an `electron` project, and an app-launch fixture replacing
`goto` — not a config flag. Until someone needs it, don't pretend the `controlled` profile fits.

### Native mobile apps

Out of scope entirely. Playwright drives browsers; native iOS/Android needs Appium, Maestro, XCUITest
or Espresso. **Mobile _web_** is a different question — Playwright emulates it well, there is just
no device-emulation project configured here yet. Adding one is small if you want it.

### Component testing

No `@playwright/experimental-ct-*` setup. The scaffold's seam is _what is the system under test_,
and a component in isolation is a different seam — usually better served by Vitest + Testing
Library in the app's own repo.

---

## 4. Deliberate limits (choices, not oversights)

- **Chromium only.** Every UI project is `devices['Desktop Chrome']` — no WebKit, no Firefox. This
  is a decision, not an omission: it keeps CI time and flake surface down, and cross-browser bugs
  are usually better caught by a small dedicated suite than by tripling every run. Add browsers by
  parameterising the `functional`/`e2e` projects if your risk profile calls for it.
- **No visual regression.** Deliberate — see the `salesforce` pack's reasoning: styling churns,
  and the scaffold already bans styling-based selectors for the same reason.
- **No `@axe-core` by default.** On a platform org you would mostly be auditing the vendor's
  components, not your own.

---

## 5. Heavy enterprise SPAs that are not Salesforce

Workday, SAP Fiori, ServiceNow, Dynamics and similar have no dedicated profile. Use `generic`, and
apply one Salesforce lesson to them: **treat Constitution #2 (`networkidle`) as a refusal, not a
warning.** These platforms poll continuously, so the network never goes quiet for the 500 ms
`networkidle` needs — the wait either hangs to timeout or resolves in a random gap. Use
`helpers/util/network.ts` and pre-register the specific gating response instead.

Their generated markup also tends to churn like Lightning's, so prefer role and label engines over
anything structural — `selectors` covers the reasoning.
