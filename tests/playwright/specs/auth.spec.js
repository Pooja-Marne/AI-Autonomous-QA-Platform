const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { ShellPage } = require('../pages/ShellPage');

test.describe('Login / Logout', () => {
  test('@login @smoke Login with valid credentials navigates to dashboard', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin', 'admin123');
    await page.waitForURL('**/dashboard.html');
    await expect(page.locator('[data-test="logged-in-user"]')).toContainText('admin');
  });

  test('@login Login with invalid credentials shows an error message', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('admin', 'wrong-password');
    await expect(loginPage.errorText).toHaveText('Invalid username or password.');
    await expect(page).toHaveURL(/login\.html/);
  });

  test('@login Login with empty fields shows an error message', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginButton.click();
    await expect(loginPage.errorText).toHaveText('Invalid username or password.');
  });

  test('@logout Logout clears the session and returns to login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsAdmin();

    const shell = new ShellPage(page);
    await shell.logout();
    await expect(page).toHaveURL(/login\.html/);

    // Session is really cleared, not just a redirect — going straight to
    // dashboard.html again should bounce back to login.
    await page.goto('/dashboard.html');
    await expect(page).toHaveURL(/login\.html/);
  });
});
