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

- Lightning DOM ids and classes are **hashed and unstable** — never select on them (same trap as CSS-modules).
- Prefer `getByRole`/`getByLabel`/stable text. Add `data-testid` only where you control the component.
- Iframes (Visualforce, classic): use `page.frameLocator(...)`.
- Shadow DOM: Playwright pierces open shadow roots automatically for role/text engines — prefer those over CSS.

## Adding a testId to a controllable component

Add `testId?: string` to props; render `data-testid={testId}`. Locate with `getByTestId`. kebab-case,
feature-prefixed, no state encoded (`door-status`, not `door-status-closed`).

## Checklist

- [ ] Located via the active profile's priority, from real DOM evidence.
- [ ] No CSS-class/XPath/nth-child/auto-id.
- [ ] Resolves to exactly one element (or `.first()`/`.last()` is intentional).
- [ ] Declared as a class field in the page object, not inline.
