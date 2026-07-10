const { resolve } = require('../locators/resolve');

class DashboardPage {
  constructor(page) {
    this.page = page;
    this.cardsGrid = page.locator(resolve('DashboardPage.cardsGrid', '[data-test="dashboard-cards"]'));
    this.cardProducts = page.locator(resolve('DashboardPage.cardProducts', '[data-test="card-products"]'));
    this.cardUsers = page.locator(resolve('DashboardPage.cardUsers', '[data-test="card-users"]'));
    this.cardOrders = page.locator(resolve('DashboardPage.cardOrders', '[data-test="card-orders"]'));
    this.cardPendingOrders = page.locator(resolve('DashboardPage.cardPendingOrders', '[data-test="card-pending-orders"]'));
  }

  async goto() {
    await this.page.goto('/dashboard.html');
  }
}

module.exports = { DashboardPage };
