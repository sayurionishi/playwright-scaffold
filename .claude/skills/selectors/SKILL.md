---
name: selectors
description: Use when choosing a locator for any element, fixing a strict-mode/locator-not-found error, or adapting locator strategy to the app type (generic, controlled-source, Salesforce). Reads the active profile from PROJECT.md.
---

# Selectors — Locator Strategy

Locators live in **page objects only** — never in specs, never in helpers.

## Explore before you choose

Never guess a selector. Open the live element with **playwright-cli** (`navigate`, `snapshot`,
`generate_locator`) and pick from what's actually in the DOM. If you can't explore, **stop and ASK**.

## Priority depends on the profile (PROJECT.md)

| Profile             | Order                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| `generic` (default) | `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText` → `getByTestId`      |
| `controlled`        | **`getByTestId`** → `getByRole` → `getByLabel` → `getByText`                       |
| `salesforce`        | `getByRole` → `getByLabel` → `getByText` → `getByTestId` (+ Lightning notes below) |

`generic` follows Playwright's official guidance (user-facing first). `controlled` elevates testId
because you can add `data-testid` to the app you own — it's the most stable. Read `PROJECT.md` to
know which is active; if absent, use `generic`.

## Prohibited everywhere (ESLint + review)

```ts
page.locator('.btn-primary'); // ❌ CSS class — changes; CSS-modules hash it
page.locator('[class*="control"]'); // ❌ partial-class — only for the loader trap, sparingly
page.locator('//button[1]'); // ❌ XPath — fragile
page.locator('div:nth-child(3)'); // ❌ structural — breaks on DOM change
page.locator('#react-select-3-option'); // ❌ auto-generated id — non-deterministic
```

## Strict mode — one match or be explicit

A locator resolving to >1 element throws. Scope it (`modal.getByRole(...)`), or add `.first()`/`.last()`
intentionally. If you wrap a fallback with `.or()`, tail it with `.first()` — testId wrappers often
contain the fallback text as a child, causing a strict-mode collision.

## Salesforce / Lightning notes (`salesforce` profile)

> **Load `salesforce-locators` instead of this section** for any real Salesforce work — it carries the
> full Lightning cookbook (combobox, datatable, modal, toast, record fields) and the strict-mode traps.
> The summary below is only enough to recognize that you need it.

- Lightning ids are **regenerated per render** (`input-42`) and `slds-*` classes are a design system, not
  an API — never select on either.
- Prefer `getByRole`/`getByLabel`/stable text. `getByTestId` is LAST on this profile: you can't add
  `data-testid` to a standard Lightning component (only to a custom LWC you own).
- Iframes (Visualforce, Classic): `page.frameLocator(...)`, selected by `title`/`name`, never by index.
- Shadow DOM: Lightning defaults to **synthetic** shadow, not native, so automatic piercing behaves
  differently than you'd expect. Role/label engines work in both — rely on those.
- The classic Salesforce strict-mode trap: the highlights panel duplicates detail-panel field values, so a
  bare `getByText('Acme Corp')` matches twice. Scope by region — don't reach for `.first()`.

## Adding a testId to a controllable component

Add `testId?: string` to props; render `data-testid={testId}`. Locate with `getByTestId`. kebab-case,
feature-prefixed, no state encoded (`door-status`, not `door-status-closed`).

## Checklist

- [ ] Located via the active profile's priority, from real DOM evidence.
- [ ] No CSS-class/XPath/nth-child/auto-id.
- [ ] Resolves to exactly one element (or `.first()`/`.last()` is intentional).
- [ ] Declared as a class field in the page object, not inline.
