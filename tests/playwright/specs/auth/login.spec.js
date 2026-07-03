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

  test('@regression TC-L05: Login with empty username shows error', async () => {
    await loginPage.login('', USERS.standard.password);
    const msg = await loginPage.getErrorMessage();
    expect(msg).toContain(MESSAGES.emptyUsername);
  });

  test('@regression TC-L06: Login with empty password shows error', async () => {
    await loginPage.login(USERS.standard.username, '');
    const msg = await loginPage.getErrorMessage();
    expect(msg).toContain(MESSAGES.emptyPassword);
  });

  test('@regression TC-L07: Login with both fields empty shows username error', async () => {
    await loginPage.loginButton.click();
    const msg = await loginPage.getErrorMessage();
    expect(msg).toContain(MESSAGES.emptyUsername);
  });

  test('@regression TC-L08: Error icon appears on invalid login', async () => {
    await loginPage.login(USERS.invalid.username, USERS.invalid.password);
    const icons = loginPage.errorIcon;
    await expect(icons.first()).toBeVisible();
  });

  test('@regression TC-L09: Username field accepts input correctly', async ({ page }) => {
    await loginPage.usernameInput.fill(USERS.standard.username);
    await expect(loginPage.usernameInput).toHaveValue(USERS.standard.username);
  });

  test('@regression TC-L10: Password field masks input', async ({ page }) => {
    await loginPage.passwordInput.fill(USERS.standard.password);
    const type = await loginPage.passwordInput.getAttribute('type');
    expect(type).toBe('password');
  });

  test('@regression TC-L11: Login with performance glitch user succeeds', async ({ page }) => {
    await loginPage.login(USERS.performance.username, USERS.performance.password);
    await page.waitForURL('**/inventory.html', { timeout: 20000 });
    await expect(page.locator('[data-test="inventory-container"]')).toBeVisible();
  });

  test('@regression TC-L12: Logout returns user to login page', async ({ page }) => {
    await loginPage.login(USERS.standard.username, USERS.standard.password);
    await page.waitForURL('**/inventory.html');
    await page.locator('#react-burger-menu-btn').click();
    await page.waitForSelector('[data-test="logout-sidebar-link"]', { state: 'visible' });
    await page.locator('[data-test="logout-sidebar-link"]').click();
    await expect(page).toHaveURL('/');
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('@regression TC-L13: Navigating directly to inventory without login redirects', async ({ page }) => {
    await page.goto('/inventory.html');
    await expect(page).toHaveURL('/');
  });

  test('@regression TC-L14: Login button is enabled by default', async () => {
    await expect(loginPage.loginButton).toBeEnabled();
  });

  test('@regression TC-L15: Error message can be dismissed', async ({ page }) => {
    await loginPage.login(USERS.invalid.username, USERS.invalid.password);
    await expect(loginPage.errorMessage).toBeVisible();
    await page.locator('[data-test="error"] button').click();
    await expect(loginPage.errorMessage).not.toBeVisible();
  });
});
