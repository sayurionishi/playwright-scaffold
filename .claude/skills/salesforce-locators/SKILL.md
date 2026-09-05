---
name: salesforce-locators
description: Use when locating any element in Salesforce Lightning — inputs, comboboxes, datatables, modals, toasts, tabs, record fields — or when fixing a strict-mode violation or locator-not-found in an org. The Lightning locator cookbook, plus the traps that only exist in Salesforce.
---

# Salesforce Locators — the Lightning cookbook

Extends `selectors` with Salesforce specifics. The generic rules still hold: locators live in page
objects only, one match or explicit `.first()`, no CSS classes, no XPath.

> **Verify before you commit.** The patterns below follow Salesforce's documented base-component
> semantics, but markup varies by release, by record type, and by whether the org has enabled native
> shadow DOM. Confirm each one against the live org with playwright-cli `snapshot` before shipping it.
> Constitution rule #4 applies: don't ship a locator you haven't seen resolve.

## Priority on this profile

`getByRole` → `getByLabel` → `getByText` → `getByTestId`

testId is last because you cannot add `data-testid` to a standard Lightning component. In a custom LWC
you own, add one — and then it comes _first for that component_.

## What makes Lightning different

Three things, all of which break naive selectors:

1. **Generated ids.** Every render assigns ids like `input-42`, `combobox-button-7`,
   `lightning-datatable-13`. They change between renders of the same page. Never select on them.
2. **`slds-*` classes are a design system, not an API.** `.slds-button_brand` is styling that Salesforce
   restyles between releases, and it matches dozens of elements. Never select on them.
   `data-aura-rendered-by` is likewise a framework internal.
3. **Synthetic shadow DOM.** Lightning's default is _synthetic_ shadow — regular DOM with scoping
   attributes — not native. Playwright's automatic shadow piercing applies to native roots, so behavior
   differs between an org with native shadow enabled and one without. Role and label engines work in
   both; CSS descendant selectors work in neither, reliably.

## The cookbook

### Text input / textarea (`lightning-input`, `lightning-textarea`)

Lightning associates the visible label with the input properly, so `getByLabel` works and is the right
choice. Prefer `exact: true` — Salesforce field labels overlap heavily ("Name" vs "Account Name").

```ts
readonly accountName = this.page.getByLabel('Account Name', { exact: true });
```

`fill()` alone often leaves Save disabled: Lightning inputs commit their dirty flag on **blur**, not on
keystroke. Use `fillAndBlur` from `helpers/util/forms.ts`. This is the #1 "Save button never enables" bug.

### Picklist / combobox (`lightning-combobox`)

A Lightning combobox is a button that opens a listbox — it is **not** a `<select>`, so
`selectOption()` does nothing. Two steps, always:

```ts
readonly stage = this.page.getByRole('combobox', { name: 'Stage' });
async selectStage(value: string): Promise<void> {
  await this.stage.click();
  await this.page.getByRole('option', { name: value, exact: true }).click();
}
```

The options render in a listbox that may be portalled outside the field's container — so scope the
option lookup to the page or to the open listbox, **not** to the field's parent.

### Lookup / record picker

Type-ahead against the server. Pre-register the search response or you will click a stale option list:

```ts
async selectAccount(name: string): Promise<void> {
  const results = waitForUiApi(this.page, 'lookups');   // salesforce-waits
  await this.page.getByRole('combobox', { name: 'Account' }).fill(name);
  await results;
  await this.page.getByRole('option', { name }).click();
}
```

### Datatable (`lightning-datatable`)

Exposes proper grid semantics — use them instead of reaching for rows by index:

```ts
readonly grid = this.page.getByRole('grid');
row(name: string) { return this.grid.getByRole('row').filter({ hasText: name }); }
cell(rowName: string, column: string) {
  return this.row(rowName).getByRole('gridcell').filter({ hasText: column });
}
```

Two traps: the header is also a `row` (`.filter({ hasText })` normally excludes it, but a header
matching your text will not be excluded), and **virtual scrolling** means offscreen rows are not in the
DOM at all. A row you can't find may simply need scrolling — don't raise the timeout.

### Modal / dialog

Always scope inside the dialog. Salesforce keeps the record page mounted behind the modal, so an
unscoped `getByLabel('Name')` matches both the modal field and the page behind it — a strict-mode
violation that reads like a duplicate-element mystery.

```ts
readonly modal = this.page.getByRole('dialog');
readonly modalSave = this.modal.getByRole('button', { name: 'Save', exact: true });
```

### Toast

Salesforce's success/error confirmation. It has `role="status"` (or `alert` for errors) and it
**auto-dismisses**, so assert it with a web-first assertion promptly — never after other work.

```ts
readonly toast = this.page.getByRole('status').filter({ hasText: /was (created|saved)/i });
```

Prefer asserting the _record state_ over the toast where you can. A toast is a transient UI courtesy; the
saved record is the actual outcome. See `salesforce-waits` for the race.

### Record detail fields

The highest-value trap in this whole document: **the highlights panel duplicates detail-panel values.**
A record page shows key fields in the compact layout at top _and_ in the details tab. So:

```ts
// ❌ strict-mode violation — matches highlights panel AND details section
this.page.getByText('Acme Corp');

// ✅ scope to the field's own layout item, by its label
fieldValue(label: string) {
  return this.page.getByRole('listitem').filter({ has: this.page.getByText(label, { exact: true }) });
}
```

Scope by region (`getByRole('region', { name: 'Details' })`) or by the layout item carrying the label.
Never disambiguate with `.first()` here — which of the two you get is not stable.

### Tabs, App Launcher, global actions

```ts
readonly detailsTab = this.page.getByRole('tab', { name: 'Details' });
readonly appLauncher = this.page.getByRole('button', { name: 'App Launcher' });
readonly newButton = this.page.getByRole('button', { name: 'New', exact: true });
```

`exact: true` on `New` matters — record pages carry "New Task", "New Event", "New Note" simultaneously.

### Visualforce and Classic — iframes

```ts
readonly vfFrame = this.page.frameLocator('iframe[title="accountDetails"]');
readonly vfSubmit = this.vfFrame.getByRole('button', { name: 'Submit' });
```

Select the frame by its `title` or `name` attribute — those are author-controlled and stable. Never by
index; Lightning adds and removes utility-bar and canvas iframes unpredictably. A Lightning page hosting
a Visualforce component has both DOM worlds live at once, so an unscoped locator can match either.

### Custom LWC you own

Add `data-testid` in the template and it becomes your first choice for that component:

```html
<lightning-button data-testid="invoice-approve" label="Approve"></lightning-button>
```

kebab-case, feature-prefixed, no state encoded (`invoice-approve`, not `invoice-approve-disabled`).
Note that `data-testid` on an LWC _component_ tag may land on the host element rather than the rendered
button — verify where it actually renders before relying on it.

## Strict-mode triage in Lightning

When you hit "resolved to N elements", check these in order — the answer is almost always here:

1. **Highlights panel vs details panel** duplicating a field value. → scope by region/layout item.
2. **A modal open over the record page.** → scope to `getByRole('dialog')`.
3. **Related lists** repeating the parent's name in every row. → scope to the list's region.
4. **The console app** keeping multiple record tabs mounted simultaneously. → scope to the active tab.
5. **Utility bar** panels mounted but hidden. → they're in the DOM; scope, or filter on visibility.

In every one of those, `.first()` is the wrong fix — it makes the test pass while asserting on whichever
copy happened to come first in the DOM. Scope instead.

## Don't

- Don't select on `slds-*`, `data-aura-rendered-by`, or `lightning-*-NNN` ids.
- Don't use `selectOption()` on a Lightning combobox — it's not a `<select>`.
- Don't reach into a datatable by row index.
- Don't use `.first()` to escape a highlights-panel collision.
- Don't select an iframe by index.
- Don't ship a locator you haven't watched resolve in the live org.

## Checklist

- [ ] Located via role/label/text, verified against live DOM.
- [ ] `exact: true` where Salesforce labels overlap.
- [ ] Modal/related-list/region scoping applied instead of `.first()`.
- [ ] Comboboxes driven by click → option, not `selectOption`.
- [ ] Text fields committed with `fillAndBlur`.
- [ ] Iframes selected by `title`/`name`.
