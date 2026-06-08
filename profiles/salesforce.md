# Profile: salesforce

For Salesforce (Lightning) or another heavy, chatty SPA.

- **Locator priority:** `getByRole` → `getByLabel` → `getByText` → `getByTestId`.
- **NEVER trust Lightning ids/classes** — they're hashed and unstable (same trap as CSS-modules). No CSS-class/id selectors, ever.
- **Waits — critical:** `networkidle` is _especially_ broken here (Aura framework polls constantly, CometD long-polls, batched `/aura` XHRs — the network is never quiet). Use ONLY pre-registered `waitForRest`/`waitForGraphQL` and web-first assertions.
- **Iframes:** Visualforce / classic pages run in iframes — use `page.frameLocator(...)`.
- **Shadow DOM:** open shadow roots are pierced by role/text engines — prefer those over CSS.
- **Auth:** Salesforce login/SSO is slow — definitely use the `setup` project + stored `storageState` so each test skips login.
- **API:** Salesforce REST/SOAP/Composite APIs are excellent for fast setup/teardown (create records, then validate in UI). Strongly prefer API setup over UI clicking.
- **Projects:** `setup`, `functional`, `e2e`, and `api` for setup/teardown.
