class CartPage {
  constructor(page) {
    this.page = page;
    this.title = page.locator('[data-test="title"]');
    // SauceDemo uses data-test="inventory-item" (NOT "cart-item") for cart items
    this.cartItems = page.locator('[data-test="inventory-item"]');
    this.continueShoppingBtn = page.locator('[data-test="continue-shopping"]');
    this.checkoutBtn = page.locator('[data-test="checkout"]');
    this.cartList = page.locator('[data-test="cart-list"]');
  }

  async isOnCartPage() {
    await this.page.waitForURL('**/cart.html');
    return await this.cartList.isVisible();
  }

  async getTitle() {
    return await this.title.textContent();
  }

  async getCartItemCount() {
    // Wait for cart list to be rendered before counting
    await this.page.waitForLoadState('domcontentloaded');
    return await this.cartItems.count();
  }

  async getCartItemNames() {
    return await this.page.locator('[data-test="inventory-item-name"]').allTextContents();
  }

  async getCartItemPrices() {
    const priceTexts = await this.page.locator('[data-test="inventory-item-price"]').allTextContents();
    return priceTexts.map(p => parseFloat(p.replace('$', '')));
  }

  // Remove by product ID (most reliable — maps directly to data-test="remove-{id}")
  async removeItemById(itemId) {
    await this.page.locator(`[data-test="remove-${itemId}"]`).click();
  }

  // Remove by name — iterates cart items to find exact match
  async removeItemByName(itemName) {
    await this.page.waitForLoadState('domcontentloaded');
    const allItems = this.page.locator('[data-test="inventory-item"]');
    const count = await allItems.count();
    for (let i = 0; i < count; i++) {
      const item = allItems.nth(i);
      const name = await item.locator('[data-test="inventory-item-name"]').textContent();
      if (name && name.trim() === itemName) {
        await item.locator('button').click();
        return;
      }
    }
    throw new Error(`Cart item "${itemName}" not found`);
  }

  async getItemQuantity(itemName) {
    await this.page.waitForLoadState('domcontentloaded');
    const allItems = this.page.locator('[data-test="inventory-item"]');
    const count = await allItems.count();
    for (let i = 0; i < count; i++) {
      const item = allItems.nth(i);
      const name = await item.locator('[data-test="inventory-item-name"]').textContent();
      if (name && name.trim() === itemName) {
        return parseInt(await item.locator('[data-test="item-quantity"]').textContent());
      }
    }
    throw new Error(`Cart item "${itemName}" not found`);
  }

  async continueShopping() {
    await this.continueShoppingBtn.click();
  }

  async proceedToCheckout() {
    await this.checkoutBtn.click();
  }
}

module.exports = { CartPage };
