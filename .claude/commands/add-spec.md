---
description: Add a Playwright spec for a feature, following this scaffold’s standards.
---

Add a spec covering **<feature>** at the **<layer>** layer.

Load the `test-standards` skill first, and `api-testing` if the layer is `api`.

Work in this order, and stop to ask rather than guessing at step 2:

1. **Pick the layer deliberately.** Folder = project = system under test. `functional` is one
   screen, `e2e` is one whole journey (one test, not one per step), `api` is the backend as SUT.
   If the request spans layers, say so and propose the split before writing anything.
2. **Explore, do not invent.** Read the live app or the OpenAPI document for every selector, route,
   endpoint and user-facing string. Constitution #4 forbids guessing any of them — if you cannot
   reach the source, ASK. This is the step where confidence is either earned or faked.
3. **Locators go in a page object**, never in the spec (#9), and it is consumed via its fixture,
   never constructed with `new` (#10). If the page object does not exist yet, that is a separate
   `/add-page-object` job — propose it rather than inlining locators "just this once".
4. **Exactly one tag** (#14), via the option form: `test('…', { tag: '@smoke' }, …)`. Add
   `annotation` for a ticket if there is one.
5. **Data:** happy-path values from a Faker factory, invalid/boundary values from
   `test-data/static/`. Never a `.json` file (#12).
6. **Waits:** a pre-registered response wait or a web-first assertion. `expect.poll` for anything
   that settles asynchronously. Never a sleep (#1).
7. **Verify:** `npm run lint && npm run typecheck`, then run the new spec — the file only, never
   the whole suite. Report what you ran and what it said.

If the user has not already said **the feature or endpoint to cover** and **functional | e2e | api**, ask before starting.
