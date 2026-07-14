const { test, expect } = require('../fixtures/healingTest');
const { LoginPage } = require('../pages/LoginPage');
const { OrdersPage } = require('../pages/OrdersPage');

test.describe('Orders', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsAdmin();
  });

  test('@create-order @smoke Creating an order shows it as pending in the table', async ({ page }) => {
    const ordersPage = new OrdersPage(page);
    await ordersPage.goto();
    await ordersPage.createOrder('Wireless Mouse', 'Dana');
    await expect(ordersPage.rowByCustomer('Dana')).toBeVisible();
    await expect(ordersPage.rowByCustomer('Dana')).toContainText('pending');
  });

  test('@create-order Creating an order with an empty customer shows a validation toast', async ({ page }) => {
    const ordersPage = new OrdersPage(page);
    await ordersPage.goto();
    await ordersPage.createOrderButton.click();
    await ordersPage.saveOrderButton.click();
    await expect(page.locator('#toast')).toContainText('Customer name is required.');
  });

  test('@approve-order Approving a pending order updates its status', async ({ page }) => {
    const ordersPage = new OrdersPage(page);
    await ordersPage.goto();
    await expect(ordersPage.rowByCustomer('Alice')).toContainText('pending');
    await ordersPage.approveOrderByCustomer('Alice');
    await expect(ordersPage.rowByCustomer('Alice')).toContainText('approved');
  });
});
