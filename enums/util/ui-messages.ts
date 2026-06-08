/**
 * User-facing UI message strings the tests assert on — single source of truth.
 *
 * VERIFY every string against the live app before adding it (playwright-cli / browser).
 * Never guess UI text. EXAMPLES — replace with your app's real copy.
 */
export const UiMessages = {
  LOGIN_ERROR_INVALID: 'Invalid email or password',
  REQUIRED_FIELD: 'This field is required',
  SAVE_SUCCESS: 'Saved successfully',
} as const;

export type UiMessage = (typeof UiMessages)[keyof typeof UiMessages];
