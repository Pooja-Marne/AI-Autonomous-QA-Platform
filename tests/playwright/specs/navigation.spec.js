const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { ShellPage } = require('../pages/ShellPage');

test.describe('Navigation Menu', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsAdmin();
  });

  test('@navigation @smoke Every sidebar link navigates to its page', async ({ page }) => {
    const shell = new ShellPage(page);

    await shell.navProducts.click();
    await expect(page).toHaveURL(/products\.html/);

    await shell.navUsers.click();
    await expect(page).toHaveURL(/users\.html/);

    await shell.navOrders.click();
    await expect(page).toHaveURL(/orders\.html/);

    await shell.navDashboard.click();
    await expect(page).toHaveURL(/dashboard\.html/);
  });

  test('@navigation The active page is highlighted in the sidebar', async ({ page }) => {
    const shell = new ShellPage(page);
    await shell.navProducts.click();
    await expect(shell.navProducts).toHaveClass(/active/);
    await expect(shell.navDashboard).not.toHaveClass(/active/);
  });
});
