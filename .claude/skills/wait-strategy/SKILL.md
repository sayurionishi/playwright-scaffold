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

If you keep a `networkidle`, leave an inline comment saying _why this page goes quiet_.

> **On the `salesforce` profile `networkidle` is a hard REFUSAL** (Constitution #2), not a discouragement —
> and `/aura` cannot be waited on by URL either, because every Aura action batches through one endpoint.
> Load **`salesforce-waits`** for what to wait on instead (`ui-api` paths, toasts, spinners, inline edit).

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

## The timeout budget — fail fast, and fail DIAGNOSABLY

Playwright's `actionTimeout` defaults to **0: no timeout at all**. So an un-clickable element does not
fail on its own — it spins until the whole TEST times out, and you get:

```
Test timeout of 30000ms exceeded.        ← tells you nothing
```

With `actionTimeout` set (`playwright.config.ts`), the same failure reports:

```
locator.click: Timeout 10000ms exceeded.
  waiting for locator('button[name="Save"]')
    - locator resolved to <button disabled>…</button>
    - element is not enabled              ← names the element AND the failed check
```

That's the real reason to bound it. Speed is the bonus; **diagnosability is the point.**

### What `click()` is actually waiting for (actionability)

1. attached to the DOM
2. visible
3. stable (not animating)
4. **receives pointer events** — not covered by another element
5. enabled

**#4 is what hangs in practice.** The element is right there and visible, but permanently under a
toast, a modal backdrop, a sticky header, or a spinner overlay that never cleared. Playwright retries
silently and only tells you at timeout. If a click times out on a visible, enabled element, suspect an
overlay first — and fix the missing wait, not the timeout.

### The ordering invariant

```
actionTimeout  <  expect.timeout × (a few retries)  <  test timeout
```

If `actionTimeout` ≥ the test timeout it can never fire, and you're back to the useless generic
message. Keep a wide gap so the specific error always wins the race.

### Current budget

| Setting             | Generic        | Salesforce | Why                                                |
| ------------------- | -------------- | ---------- | -------------------------------------------------- |
| `actionTimeout`     | 10s            | 15s        | one interaction; longer means something is wrong   |
| `navigationTimeout` | 20s            | 30s        | page loads legitimately exceed a click             |
| `expect.timeout`    | 7s             | 7s         | per web-first assertion, and they retry            |
| test timeout        | 45s (e2e 120s) | 90s        | above action+navigation so the specific error wins |
| `globalTimeout`     | 30 min (CI)    | —          | one hung worker must not burn the CI allowance     |

Lightning gets more headroom because Aura hydration and the record-page bootstrap are genuinely slow.
That's a fact about the platform, not a concession — squeezing it produces false failures, which
teaches people to ignore timeouts.

Note the e2e row: the TEST budget grows, the per-ACTION budget does not. A single click should never
take longer in a journey than in a functional test; only the number of clicks changes.

### Needing more time is a local decision, never a global one

Raising a global timeout to green a red test is Constitution #13 — silencing a failure. If one test is
legitimately slow, say so at that test:

```ts
test.slow(); // triples this test's timeout — built in, for known-slow tests
test.setTimeout(120_000); // explicit; requires a comment justifying it
```

## When waitForTimeout is _grudgingly_ acceptable

Only for a non-network animation with no DOM/network signal, with a `// TODO` and a tracking ticket. Treat as a smell.

## Checklist

- [ ] No `waitForTimeout`.
- [ ] No `networkidle` on an SPA; any kept use is on a static page with an explaining comment.
- [ ] Every response wait is pre-registered before its trigger.
- [ ] Screen-readiness uses a web-first assertion, not a sleep.
- [ ] Loader waits use partial-match or testid + `.first()`.
- [ ] Save-after-fill flows blur to commit the dirty flag.
- [ ] No timeout was RAISED to make a failure go away (#13). Slow-by-nature tests use `test.slow()`.
