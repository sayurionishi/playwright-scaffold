import type { Page } from '@playwright/test';
import { BasePage } from './base.page';
import { Routes } from '../enums/util/routes';
import { ApiEndpoints } from '../enums/util/api-endpoints';
import { waitForRest } from '../helpers/util/network';

/**
 * EXAMPLE page object. Replace locators/actions with your app's real login screen.
 *
 * Demonstrates the scaffold conventions:
 *  - extends BasePage
 *  - locators-on-top, semantic-first (generic profile default)
 *  - actions only; the spec does the asserting
 *  - deterministic wait: pre-register the login response BEFORE clicking
 */
export class LoginPage extends BasePage {
  // ── Locators (semantic-first; the bootstrap skill flips these to testId for the controlled profile) ──
  readonly emailInput = this.page.getByLabel('Email');
  readonly passwordInput = this.page.getByLabel('Password');
  readonly signInButton = this.page.getByRole('button', { name: /sign in|log in/i });
  readonly errorMessage = this.page.getByRole('alert');

  constructor(page: Page) {
    super(page);
  }

  async goto(): Promise<void> {
    await this.page.goto(Routes.LOGIN);
  }

  /**
   * Fill credentials and submit. Pre-registers the login response so the wait is
   * deterministic regardless of how fast the backend answers.
   */
  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    const loggedIn = waitForRest(this.page, ApiEndpoints.LOGIN);
    await this.signInButton.click();
    await loggedIn;
  }
}
