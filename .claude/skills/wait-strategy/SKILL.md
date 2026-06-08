---
name: wait-strategy
description: Use when making any test wait reliably, fixing a flaky/timing-dependent test, or deciding how to wait for navigation, a response, an element, or a form commit. The single most important anti-flake skill.
---

# Wait Strategy — Zero Timeouts, Zero networkidle

The #1 source of flake is bad waits. This scaffold uses **deterministic** waits only.

## One hard ban, one strong default

1. **`page.waitForTimeout(ms)` — BANNED (ESLint error).** A blind sleep is either too short (flake) or too long (slow). Never a primary wait.
2. **`page.waitForLoadState('networkidle')` — DISCOURAGED, not banned (ESLint warns).** It resolves after 500 ms of network silence. The key question is: _does this page ever go quiet?_

### When `networkidle` is the WRONG tool (the common case)

On a chatty SPA — React with polling, and **especially Salesforce Lightning** (Aura server actions, CometD long-poll, batched `/aura` XHRs, beacons) — the network is _never_ quiet for 500 ms. The wait either hangs to timeout or resolves in a random gap between requests. It is non-deterministic there. Replace it with a pre-registered response wait or a web-first assertion.

### When `networkidle` is legitimately FINE

- **Static / server-rendered pages** with no background polling — a classic multi-page site's initial load that fires a burst of requests then genuinely settles.
- **Exploration / debugging** (remove before committing).
- A page where you must wait for an unknown burst of parallel resource loads to settle AND you've confirmed there's no recurring poll.

If you keep a `networkidle`, leave an inline comment saying _why this page goes quiet_. The `salesforce` profile treats it as effectively never acceptable.

> Opinions on `networkidle` differ (some ban it outright, some call it "acceptable but not preferred"). The truth is profile-dependent: harmful on SPAs, fine on static pages. Default to deterministic waits and reach for `networkidle` only when you can name why the page settles.

## The hierarchy — use the first that applies

1. **Wait for the specific gating response** — `waitForRest` / `waitForGraphQL` in `helpers/util/network.ts`. Use when a network call gates the next step.
2. **Web-first assertion on a DOM signal** — `toBeVisible`, `toBeHidden`, `toBeEnabled`, `toHaveValue`, `toContainText`. Playwright auto-retries these until the timeout. This is the default for "is the screen ready?".
3. **`waitForURL`** — for navigations.

## THE GOLDEN RULE — pre-register before you trigger

`page.waitForResponse(...)` only catches responses arriving _after_ it is called. Click-first, wait-second misses fast responses and times out silently.

```ts
// ✅ arm, trigger, await
const loaded = waitForRest(page, '/api/products'); // 1
await searchButton.click(); // 2
await loaded; // 3

// ❌ misses an already-arrived response
await searchButton.click();
await waitForRest(page, '/api/products');
```

Concurrent requests → arm both, then `Promise.all`:

```ts
const a = waitForRest(page, '/api/cart');
const b = waitForGraphQL(page, 'UpdateCartTotals');
await option.click();
await Promise.all([a, b]);
```

## Blur after fill — commit the dirty flag

Controlled-form components (React Hook Form, Formik, Lightning inputs) often only mark the form dirty / valid on `blur`, not on keystroke. If Save stays disabled after a `fill()`, that's why. Use `fillAndBlur` (`helpers/util/forms.ts`), then assert the value committed.

## The loader trap — partial-match CSS-module classes

`page.locator('.loader')` matches **zero** elements when the class is hashed (`loader__a1b2c`), and `toBeHidden()` on zero elements passes **trivially** — a false green. Use `[class*="loader"]` (partial) or, better, a `data-testid`. `BasePage.waitForHidden` already calls `.first()`.

## When waitForTimeout is _grudgingly_ acceptable

Only for a non-network animation with no DOM/network signal, with a `// TODO` and a tracking ticket. Treat as a smell.

## Checklist

- [ ] No `waitForTimeout`.
- [ ] No `networkidle` on an SPA; any kept use is on a static page with an explaining comment.
- [ ] Every response wait is pre-registered before its trigger.
- [ ] Screen-readiness uses a web-first assertion, not a sleep.
- [ ] Loader waits use partial-match or testid + `.first()`.
- [ ] Save-after-fill flows blur to commit the dirty flag.
