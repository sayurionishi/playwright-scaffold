---
description: Add or extend a page object for a screen, with locators on top and no assertions.
mode: agent
---

Add or extend the page object for **${input:screen}**.

Load the `page-objects` skill, and `selectors` for locator priority (it reads the active profile
from `PROJECT.md`; on a Salesforce org it defers to `salesforce-locators`).

1. **Explore the real markup first.** Do not guess a selector (#4).
2. **Locators on top**, as class fields: `readonly` when a spec asserts on it, `private readonly`
   when it is internal. Never declared inline inside a method.
3. **Actions only. No assertions** (#8) — this is lint-enforced in `pages/`. Return the locator and
   let the spec assert on it. If you find yourself wanting `expect` here, the method is doing the
   spec's job.
4. **No fragile selectors** (#3): no CSS class, id, XPath or nth-child. Also lint-enforced.
5. **Register it** in `fixtures/pom/page-object-fixture.ts` so specs consume it by destructuring.
6. Extract a component object once the same widget appears in a third place — not before.
7. Verify with `npm run lint && npm run typecheck`.
