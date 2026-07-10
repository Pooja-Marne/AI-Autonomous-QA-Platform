const { resolve } = require('../locators/resolve');

class ProductDetailPage {
  constructor(page) {
    this.page = page;
    this.productName = page.locator(resolve('ProductDetailPage.productName', '[data-test="inventory-item-name"]'));
    this.productDesc = page.locator(resolve('ProductDetailPage.productDesc', '[data-test="inventory-item-desc"]'));
    this.productPrice = page.locator(resolve('ProductDetailPage.productPrice', '[data-test="inventory-item-price"]'));
    this.productImage = page.locator(resolve('ProductDetailPage.productImage', '[data-test="item-sauce-img"]'));
    this.addToCartBtn = page.locator(resolve('ProductDetailPage.addToCartBtn', '[data-test^="add-to-cart"]'));
    this.removeBtn = page.locator(resolve('ProductDetailPage.removeBtn', '[data-test^="remove"]'));
    this.backButton = page.locator(resolve('ProductDetailPage.backButton', '[data-test="back-to-products"]'));
    this.shoppingCartLink = page.locator(resolve('ProductDetailPage.shoppingCartLink', '[data-test="shopping-cart-link"]'));
    this.cartBadge = page.locator(resolve('ProductDetailPage.cartBadge', '[data-test="shopping-cart-badge"]'));
  }

  async getName() {
    return await this.productName.textContent();
  }

  async getDescription() {
    return await this.productDesc.textContent();
  }

  async getPrice() {
    const text = await this.productPrice.textContent();
    return parseFloat(text.replace('$', ''));
  }

  async addToCart() {
    await this.addToCartBtn.click();
  }

  async removeFromCart() {
    await this.removeBtn.click();
  }

  async backToProducts() {
    await this.backButton.click();
  }

  async getCartCount() {
    if (await this.cartBadge.isVisible()) {
      return parseInt(await this.cartBadge.textContent());
    }
    return 0;
  }

  async isAddToCartVisible() {
    return await this.addToCartBtn.isVisible();
  }

  async isRemoveVisible() {
    return await this.removeBtn.isVisible();
  }
}

module.exports = { ProductDetailPage };
