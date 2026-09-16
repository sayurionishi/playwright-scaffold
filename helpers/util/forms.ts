import type { Locator } from '@playwright/test';

/**
 * Fill a field and blur it to commit the framework's "dirty" flag.
 *
 * WHY: Many controlled-form components (React Hook Form, Formik, Lightning inputs) only flip their
 * dirty/validation state on `blur`, not on every keystroke. If you `fill()` and then immediately
 * expect the Save button to enable, it can stay disabled because the form never registered the
 * change. Blur fixes it deterministically.
 *
 * ── REMOVED: the `{ verify: true }` OPTION ────────────────────────────────────────────────────
 *
 * This helper used to take `verify`, which did:
 *
 *     await locator.page().waitForFunction(
 *       ([el, v]) => (el as HTMLInputElement).value === v,
 *       [await locator.elementHandle(), value],
 *       { timeout: 5_000 },
 *     ).catch(() => {});                                  // ❌
 *
 * That is a five-second sleep wearing a disguise, inside the scaffold whose central rule is that
 * blind sleeps are banned (Constitution #1). Two reasons it could not work:
 *
 *   1. It passed an `elementHandle` into `waitForFunction`. On any component that RE-RENDERS on
 *      blur — React Hook Form, Formik, Lightning, i.e. the exact components named in the docblock
 *      above as the reason this helper exists — the handle is detached and the predicate can never
 *      become true.
 *   2. The `.catch(() => {})` swallowed the resulting timeout, so the failure was indistinguishable
 *      from success. You paid 5 seconds and learned nothing.
 *
 * It had zero call sites, so nobody had hit it yet. If you want to confirm the value committed,
 * assert it in the SPEC where a failure is visible and retried properly:
 *
 *     await fillAndBlur(page.getByLabel('Phone'), '+1 555 0100');
 *     await expect(page.getByLabel('Phone')).toHaveValue('+1 555 0100');
 *
 * `toHaveValue` is a web-first assertion: it retries, it re-resolves the locator each attempt (so
 * a re-render is fine), and it fails loudly with the actual value. See `wait-strategy`.
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 */
export async function fillAndBlur(locator: Locator, value: string): Promise<void> {
  await locator.fill(value);
  await locator.blur();
}
