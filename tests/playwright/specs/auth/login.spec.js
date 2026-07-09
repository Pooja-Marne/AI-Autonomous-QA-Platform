const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../pages/LoginPage');
const { USERS, MESSAGES } = require('../../fixtures/testData');

test.describe('SauceDemo - Login Tests', () => {
  let loginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  // ─── Smoke Tests ──────────────────────────────────────────────────────────

  test('@smoke TC-L01: Login page loads correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Swag Labs/);
    await expect(loginPage.loginLogo).toBeVisible();
    await expect(loginPage.usernameInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('@smoke TC-L02: Login with valid standard user credentials', async ({ page }) => {
    await loginPage.login(USERS.standard.username, USERS.standard.password);
    await expect(page).toHaveURL(/inventory\.html/);
    await expect(page.locator('[data-test="inventory-container"]')).toBeVisible();
  });

  // ─── Regression Tests ─────────────────────────────────────────────────────

  test('@regression TC-L03: Login with locked out user shows error', async () => {
    await loginPage.login(USERS.locked.username, USERS.locked.password);
    await expect(loginPage.errorMessage).toBeVisible();
    const msg = await loginPage.getErrorMessage();
    expect(msg).toContain(MESSAGES.lockedError);
  });

  test('@regression TC-L04: Login with invalid credentials shows error', async () => {
    await loginPage.login(USERS.invalid.username, USERS.invalid.password);
    await expect(loginPage.errorMessage).toBeVisible();
    const msg = await loginPage.getErrorMessage();
    expect(msg).toContain(MESSAGES.loginError);
  });

 
});
