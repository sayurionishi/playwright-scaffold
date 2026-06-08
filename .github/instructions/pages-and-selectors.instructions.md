---
applyTo: 'pages/**'
---

# Page objects & selectors (mirror of `.claude/skills/page-objects` + `selectors`)

- Page objects **act and expose locators; they never assert** (no `expect`, no `isVisible()` wrappers). Specs assert.
- **Locators-on-top:** every locator is a class field. `readonly` (public) if a spec asserts on it; `private readonly` if internal. Never declare locators inline in methods.
- Extends `BasePage`. `page` is `protected` — specs use the `page` fixture for URL asserts.
- **Locator priority depends on the profile** (read `PROJECT.md`):
  - generic: `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText` → `getByTestId`
  - controlled: `getByTestId` → `getByRole` → `getByLabel` → `getByText`
  - salesforce: `getByRole` → `getByLabel` → `getByText` → `getByTestId` (never Lightning hashed ids/classes)
- **Explore the live element first** (don't guess selectors). No CSS-class/XPath/nth-child/auto-id.
- Deterministic waits inside actions — pre-register `waitForRest`/`waitForGraphQL` before the trigger; no `waitForTimeout`.
- Extract a component to `pages/components/` only on the 3rd occurrence.
- Register new page objects in `fixtures/pom/page-object-fixture.ts`; tests consume via fixture, never `new`.
