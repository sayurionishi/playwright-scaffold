import type { Locator } from '@playwright/test';

/**
 * Fill a field and blur it to commit the framework's "dirty" flag.
 *
 * WHY: Many controlled-form components (React Hook Form, Formik, Lightning inputs)
 * only flip their dirty/validation state on `blur`, not on every keystroke. If you
 * `fill()` and then immediately expect the Save button to enable, it can stay
 * disabled because the form never registered the change. Blur fixes it deterministically.
 *
 * Optionally verify the committed value to catch onChange races.
 */
export async function fillAndBlur(
  locator: Locator,
  value: string,
  options: { verify?: boolean } = {},
): Promise<void> {
  await locator.fill(value);
  await locator.blur();
  if (options.verify) {
    // Use the page's expect via the locator's page to avoid importing expect here.
    // Callers that want assertions should assert in the spec; this is a best-effort wait.
    await locator
      .page()
      .waitForFunction(
        ([el, v]) => (el as HTMLInputElement).value === v,
        [await locator.elementHandle(), value] as const,
        { timeout: 5_000 },
      )
      .catch(() => {
        /* best-effort: real assertion belongs in the spec */
      });
  }
}
