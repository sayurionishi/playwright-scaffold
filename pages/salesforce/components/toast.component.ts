import type { Locator, Page } from '@playwright/test';

/**
 * Lightning toast (the transient save/error confirmation banner).
 *
 * ⚠️ TOASTS AUTO-DISMISS after a few seconds. Assert on one IMMEDIATELY after the triggering
 * action, or not at all — if you do other work first, it's gone and you get a flake that looks
 * like the save failed.
 *
 * ⚠️ PREFER ASSERTING THE RECORD. A toast is the platform's confirmation chrome; the saved record
 * is the actual outcome. Testing the toast is closer to testing Salesforce than testing your
 * config (see the `salesforce` skill). Use this component when the *message content* is your own
 * (a custom Apex/LWC error string), not to confirm a standard save worked.
 */
export class ToastComponent {
  constructor(private readonly page: Page) {}

  /** Success/info toasts use role="status". */
  get message(): Locator {
    return this.page.getByRole('status');
  }

  /** Error toasts use role="alert". */
  get error(): Locator {
    return this.page.getByRole('alert');
  }

  /** A toast whose text matches — use for asserting your own custom messages. */
  withText(text: string | RegExp): Locator {
    return this.page.getByRole('status').filter({ hasText: text });
  }

  get closeButton(): Locator {
    return this.message.getByRole('button', { name: /close/i });
  }

  /** Dismiss so a following assertion isn't obscured by the banner. */
  async dismiss(): Promise<void> {
    const close = this.closeButton;
    if ((await close.count()) > 0) await close.first().click();
  }
}
