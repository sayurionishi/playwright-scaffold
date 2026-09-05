---
name: salesforce-waits
description: Use when a Salesforce Lightning test needs to wait — record save, page navigation, spinner, toast, inline edit, list refresh — or when fixing a flaky Lightning test. Covers why /aura can't be matched by URL and what to wait on instead.
---

# Salesforce Waits — Aura is not waitable, ui-api is

Extends `wait-strategy`. Everything there still holds: no `waitForTimeout`, pre-register before you
trigger, prefer web-first assertions. This skill covers what's Salesforce-specific.

## `networkidle` is a refusal here

Not discouraged — **refused**. Aura fires server actions continuously, CometD holds a long-poll open
indefinitely, and the empty-approval/beacon traffic never stops. The network is never quiet for 500 ms, so
`networkidle` either hangs to timeout or resolves in a random gap. There is no org where this is safe.

## Why you can't wait on `/aura`

Every Aura server action posts to the **same** endpoint:

```
POST /s/sfsites/aura?r=3&aura.ApexAction.execute=1
POST /s/sfsites/aura?r=4&other.action=1
```

The operation lives in the form-encoded `message` payload, not the URL. So a URL-substring wait on
`/aura` matches the _next_ Aura call — which is very likely an unrelated background poll that fires
milliseconds later. The wait resolves, your data isn't there, and you get a flake that's nearly
impossible to read.

If you genuinely must wait on an Aura action, match the payload — but treat it as a smell:

```ts
// Last resort. Prefer a ui-api wait or a DOM assertion.
const saved = page.waitForResponse(
  (r) => r.url().includes('/aura') && (r.request().postData() ?? '').includes('Account.Save'),
);
```

## What IS deterministic: the UI API

Lightning's modern data layer (`lightning/uiRecordApi`, used by record pages, forms, and list views)
goes through versioned, _identifiable_ REST endpoints:

```
GET   /services/data/v62.0/ui-api/records/001...        ← record load
PATCH /services/data/v62.0/ui-api/records/001...        ← record save
GET   /services/data/v62.0/ui-api/object-info/Account   ← metadata + effective FLS
GET   /services/data/v62.0/ui-api/list-records/...      ← list view
POST  /services/data/v62.0/ui-api/records               ← record create
```

These are your wait targets. `helpers/salesforce/lightning.ts` wraps them:

```ts
waitForRecordLoad(page, recordId?)   // GET  ui-api/records
waitForRecordSave(page)              // PATCH/POST ui-api/records
waitForObjectInfo(page, 'Account')   // GET  ui-api/object-info/<Object>
waitForListRecords(page)             // GET  ui-api/list-records
waitForUiApi(page, fragment)         // escape hatch for any ui-api path
```

**Caveat worth knowing:** not every Lightning surface uses the UI API. Aura-era components and some
managed-package UIs still route through `/aura`. Confirm which path your screen actually uses by watching
the network in playwright-cli before choosing a wait — don't assume.

## Recipes

### Save a record

Pre-register the save, click, then assert the outcome. Two independent signals; assert the durable one.

```ts
const saved = waitForRecordSave(page);
await recordPage.save();
await saved;
// Assert the RECORD, not the toast — the toast auto-dismisses and will race you.
await expect(recordPage.fieldValue('Account Name')).toContainText('Acme Corp');
```

### Navigate to a record page

Lightning routes are client-side; the URL settles before the data does. Wait for both.

```ts
const loaded = waitForRecordLoad(page);
await listView.openRecord('Acme Corp');
await page.waitForURL(/\/lightning\/r\/Account\/[a-zA-Z0-9]{15,18}\/view/);
await loaded;
```

### Spinner

`lightning-spinner` renders `role="status"` with assistive text. Prefer asserting the _content_ appeared
over asserting the spinner left — a spinner that never mounted makes `toBeHidden()` pass trivially
(the same false-green as the hashed-loader trap in `wait-strategy`).

```ts
// ✅ positive signal
await expect(recordPage.detailsRegion).toBeVisible();

// ⚠️ only as a secondary guard, and .first() because several may mount
await page
  .getByRole('status', { name: /loading/i })
  .first()
  .waitFor({ state: 'hidden' });
```

### Toast

Auto-dismisses in a few seconds. Assert it _immediately_ after the action, or not at all:

```ts
const saved = waitForRecordSave(page);
await recordPage.save();
await saved;
await expect(page.getByRole('status')).toContainText('was saved'); // do this first
```

If you need both the toast and heavier verification, assert the toast first. Better: skip the toast and
assert the record — see `salesforce` (don't test the platform's confirmation chrome).

### Inline edit on a record page

Three separate commits, each needing its own signal: open the cell, blur the input, save the panel.

```ts
await recordPage.editButton('Phone').click();
await fillAndBlur(recordPage.input('Phone'), '+1 555 0100'); // blur commits dirty flag
const saved = waitForRecordSave(page);
await recordPage.inlineSave.click();
await saved;
```

### List view refresh after a create

The list does not necessarily refresh on its own. Trigger it and wait on `list-records`:

```ts
const refreshed = waitForListRecords(page);
await listView.refresh();
await refreshed;
await expect(listView.row('Acme Corp')).toBeVisible();
```

### Concurrent calls

Same rule as generic: arm both, then trigger.

```ts
const saved = waitForRecordSave(page);
const relisted = waitForListRecords(page);
await modal.save();
await Promise.all([saved, relisted]);
```

## The hydration trap

Lightning renders the shell before components hydrate. A button can be visible and _attached_ while its
click handler isn't wired — the click silently does nothing and the test fails on the next assertion,
pointing at the wrong place.

Don't fix this with a sleep. Wait for a signal that hydration finished — usually the record data arriving:

```ts
const loaded = waitForRecordLoad(page);
await page.goto(recordUrl(id));
await loaded;
await expect(recordPage.editButton).toBeEnabled(); // enabled, not just visible
```

`toBeEnabled()` over `toBeVisible()` is the cheap general defense here.

## Don't

- Don't use `networkidle`. Refusal on this profile.
- Don't wait on `/aura` by URL — it matches an unrelated background action.
- Don't assert a toast after doing other work; it's gone.
- Don't wait for a spinner to disappear as your only readiness signal.
- Don't raise a timeout to fix a Lightning flake. The cause is almost always a missing pre-registered
  wait or a hydration race — `debugging`.
- Don't assume every screen uses the UI API. Verify.

## Checklist

- [ ] No `networkidle`, no `waitForTimeout`.
- [ ] Waits target `ui-api` paths, not `/aura`.
- [ ] Every response wait pre-registered before its trigger.
- [ ] Save asserted on the record, not only the toast.
- [ ] Navigation waits on both `waitForURL` and the record load.
- [ ] Text fields blurred before Save.
- [ ] Readiness asserted with `toBeEnabled()` where hydration could race.
