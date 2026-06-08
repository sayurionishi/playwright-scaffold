---
name: page-objects
description: Use when creating a page object for a new screen, adding locators/actions to an existing one, or extracting a reusable component object. Defines the POM conventions.
---

# Page Objects

The contract: **page objects perform actions and expose locators; specs assert.** Tests read like
user stories; the DOM lives behind the page object.

## Anatomy

```ts
export class ProductsPage extends BasePage {
  // ── Locators on top (single source of truth) ──
  readonly heading = this.page.getByRole('heading', { name: 'Products' }); // public: specs assert on it
  private readonly addButton = this.page.getByRole('button', { name: 'Add product' });
  private readonly nameInput = this.page.getByLabel('Name');

  async goto(): Promise<void> {
    await this.page.goto(Routes.PRODUCTS);
  }

  // ── Actions only — no expect() here ──
  async addProduct(name: string): Promise<void> {
    await this.addButton.click();
    await fillAndBlur(this.nameInput, name);
    const saved = waitForRest(this.page, ApiEndpoints.PRODUCTS); // pre-register
    await this.page.getByRole('button', { name: 'Save' }).click();
    await saved;
  }
}
```

## Rules

1. **Extends `BasePage`.** Constructor takes `page`; `page` is `protected` — specs use the `page` fixture for URL asserts, not `somePage.page`.
2. **Locators-on-top.** Every locator is a class field. `readonly` (public) if a spec asserts on it; `private readonly` if internal-only. Never declare locators inline in methods.
3. **No assertions.** No `expect`, no `isVisibleReturningBoolean()` wrappers. Expose the locator; let the spec assert. (`await expect(page.heading).toBeVisible()` lives in the spec.)
4. **Waits are fine** (they're not assertions): `locator.waitFor({ state })`, the `network.ts` helpers.
5. **Deterministic waits inside actions** — pre-register response waits; never `waitForTimeout`/`networkidle`.
6. **Include feedback locators** — success/error/validation elements, so specs can assert outcomes.

## Components — extract on the 3rd occurrence

A reusable UI pattern (search box, modal, tab bar) becomes a `pages/components/*.component.ts` only
when it appears in **3+ page objects**. Before that, keep it as page-object methods. A component takes
its scope (`Page | Locator`) so it works inside modals/panels. See `pages/components/search.component.ts`.

## Register + consume via fixture

After creating a page object, register it in `fixtures/pom/page-object-fixture.ts`. Tests receive it
by destructuring (`async ({ productsPage }) => …`) — **never `new ProductsPage(page)`** in a test.

## Phases

1. `ls pages/` — resolve area, avoid duplicates.
2. Explore the live screen (playwright-cli). 3. Propose locators + actions + feedback elements.
3. Build (rules above). 5. Register in the POM fixture. 6. Use via fixture in the spec.
