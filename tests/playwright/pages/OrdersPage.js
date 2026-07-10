const { resolve } = require('../locators/resolve');

class OrdersPage {
  constructor(page) {
    this.page = page;
    this.createOrderButton = page.locator(resolve('OrdersPage.createOrderButton', '[data-test="create-order-button"]'));
    this.tableBody = page.locator(resolve('OrdersPage.tableBody', '[data-test="orders-table-body"]'));
    this.productSelect = page.locator(resolve('OrdersPage.productSelect', '[data-test="order-product-select"]'));
    this.customerInput = page.locator(resolve('OrdersPage.customerInput', '[data-test="order-customer-input"]'));
    this.saveOrderButton = page.locator(resolve('OrdersPage.saveOrderButton', '[data-test="save-order-button"]'));
  }

  async goto() {
    await this.page.goto('/orders.html');
  }

  async createOrder(productName, customer) {
    await this.createOrderButton.click();
    await this.productSelect.selectOption({ label: productName });
    await this.customerInput.fill(customer);
    await this.saveOrderButton.click();
  }

  rowByCustomer(customer) {
    return this.page.locator('tr', { hasText: customer });
  }

  async approveOrderByCustomer(customer) {
    await this.rowByCustomer(customer).locator('button', { hasText: 'Approve' }).click();
  }
}

module.exports = { OrdersPage };
