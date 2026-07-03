class InventoryPage {
  constructor(page) {
    this.page = page;
    this.title = page.locator('[data-test="title"]');
    this.inventoryContainer = page.locator('[data-test="inventory-container"]');
    this.inventoryItems = page.locator('[data-test="inventory-item"]');
    this.sortDropdown = page.locator('[data-test="product-sort-container"]');
    this.shoppingCartBadge = page.locator('[data-test="shopping-cart-badge"]');
    this.shoppingCartLink = page.locator('[data-test="shopping-cart-link"]');
    this.menuButton = page.locator('#react-burger-menu-btn');
    this.logoutLink = page.locator('[data-test="logout-sidebar-link"]');
    this.allItemsLink = page.locator('[data-test="inventory-sidebar-link"]');
    this.aboutLink = page.locator('[data-test="about-sidebar-link"]');
    this.resetLink = page.locator('[data-test="reset-sidebar-link"]');
    this.menuClose = page.locator('#react-burger-cross-btn');
  }

  async isOnInventoryPage() {
    await this.page.waitForURL('**/inventory.html');
    return await this.inventoryContainer.isVisible();
  }

  async getTitle() {
    return await this.title.textContent();
  }

  async getProductCount() {
    return await this.inventoryItems.count();
  }

  async getProductNames() {
    return await this.page.locator('[data-test="inventory-item-name"]').allTextContents();
  }

  async getProductPrices() {
    const priceTexts = await this.page.locator('[data-test="inventory-item-price"]').allTextContents();
    return priceTexts.map(p => parseFloat(p.replace('$', '')));
  }

  async addToCartByName(productName) {
    const item = this.page.locator('[data-test="inventory-item"]').filter({ hasText: productName });
    const btn = item.locator('button');
    await btn.click();
  }

  async removeFromCartByName(productName) {
    const item = this.page.locator('[data-test="inventory-item"]').filter({ hasText: productName });
    const btn = item.locator('button');
    await btn.click();
  }

  async addItemToCartById(itemId) {
    await this.page.locator(`[data-test="add-to-cart-${itemId}"]`).click();
  }

  async removeItemFromCartById(itemId) {
    await this.page.locator(`[data-test="remove-${itemId}"]`).click();
  }

  async getCartCount() {
    const badge = this.shoppingCartBadge;
    if (await badge.isVisible()) {
      return parseInt(await badge.textContent());
    }
    return 0;
  }

  async goToCart() {
    await this.shoppingCartLink.click();
    await this.page.waitForURL('**/cart.html');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async sortBy(option) {
    await this.sortDropdown.selectOption(option);
  }

  async clickProduct(productName) {
    await this.page.locator('[data-test="inventory-item-name"]').filter({ hasText: productName }).click();
  }

  async openMenu() {
    await this.menuButton.click();
    await this.page.waitForSelector('.bm-menu-wrap', { state: 'visible' });
  }

  async logout() {
    await this.openMenu();
    await this.logoutLink.click();
  }

  async resetAppState() {
    await this.openMenu();
    await this.resetLink.click();
    await this.menuClose.click();
  }

  async getAddToCartButtonText(itemId) {
    return await this.page.locator(`[data-test="add-to-cart-${itemId}"]`).textContent();
  }
}

module.exports = { InventoryPage };
