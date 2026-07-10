const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { DashboardPage } = require('../pages/DashboardPage');
const { ProductsPage } = require('../pages/ProductsPage');

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

  test('@dashboard-cards Product count updates after adding a new product', async ({ page }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();
    await productsPage.addProduct('Extra Monitor Stand', 15.5, 30);

    const dashboardPage = new DashboardPage(page);
    await dashboardPage.goto();
    await expect(dashboardPage.cardProducts).toContainText('4');
  });
});
