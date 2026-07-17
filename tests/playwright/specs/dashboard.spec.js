const { test, expect } = require('../fixtures/healingTest');
const { LoginPage } = require('../pages/LoginPage');
const { DashboardPage } = require('../pages/DashboardPage');

test.describe('Dashboard Cards', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsAdmin();
  });

  test('@dashboard-cards @smoke Dashboard shows the correct initial totals', async ({ page }) => {
    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
    await expect(dashboardPage.cardProducts).toContainText('3');
    await expect(dashboardPage.cardUsers).toContainText('3');
    await expect(dashboardPage.cardOrders).toContainText('2');
    await expect(dashboardPage.cardPendingOrders).toContainText('1');
  });
});
