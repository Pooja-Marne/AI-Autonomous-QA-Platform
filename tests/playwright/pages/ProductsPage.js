const { resolve } = require('../locators/resolve');

class ProductsPage {
  constructor(page) {
    this.page = page;
    this.searchInput = page.locator(resolve('ProductsPage.searchInput', '[data-test="product-search-input"]'));
    this.addProductButton = page.locator(resolve('ProductsPage.addProductButton', '[data-test="add-product-button"]'));
    this.tableBody = page.locator(resolve('ProductsPage.tableBody', '[data-test="products-table-body"]'));
    this.emptyState = page.locator(resolve('ProductsPage.emptyState', '[data-test="products-empty"]'));
    this.newProductName = page.locator(resolve('ProductsPage.newProductName', '[data-test="new-product-name"]'));
    this.newProductPrice = page.locator(resolve('ProductsPage.newProductPrice', '[data-test="new-product-price"]'));
    this.newProductStock = page.locator(resolve('ProductsPage.newProductStock', '[data-test="new-product-stock"]'));
    this.saveProductButton = page.locator(resolve('ProductsPage.saveProductButton', '[data-test="save-product-button"]'));
  }

  async goto() {
    await this.page.goto('/products.html');
  }

  async addProduct(name, price, stock) {
    await this.addProductButton.click();
    await this.newProductName.fill(name);
    await this.newProductPrice.fill(String(price));
    await this.newProductStock.fill(String(stock));
    await this.saveProductButton.click();
  }

  async deleteProductByName(name) {
    const row = this.page.locator('tr', { hasText: name });
    await row.locator('button', { hasText: 'Delete' }).click();
  }

  async search(term) {
    await this.searchInput.fill(term);
  }

  rowByName(name) {
    return this.page.locator('tr', { hasText: name });
  }
}

module.exports = { ProductsPage };
