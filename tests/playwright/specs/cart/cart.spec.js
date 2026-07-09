const { test, expect } = require('@playwright/test');
const { InventoryPage } = require('../../pages/InventoryPage');
const { CartPage } = require('../../pages/CartPage');
const { loginAs } = require('../../helpers/auth.helper');
const { PRODUCTS, MESSAGES } = require('../../fixtures/testData');

test.describe('SauceDemo - Cart Tests', () => {
  let inventoryPage;
  let cartPage;

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'standard');
    inventoryPage = new InventoryPage(page);
    cartPage = new CartPage(page);
  });

  // ─── Smoke Tests ──────────────────────────────────────────────────────────

  test('@smoke TC-C01: Cart is empty on fresh login', async () => {
    const count = await inventoryPage.getCartCount();
    expect(count).toBe(0);
  });

  test('@smoke TC-C02: Adding one item increments cart badge to 1', async () => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    const count = await inventoryPage.getCartCount();
    expect(count).toBe(1);
  });

  // ─── Regression Tests ─────────────────────────────────────────────────────

  test('@regression TC-C03: Cart page title is "Your Cart"', async () => {
    await inventoryPage.goToCart();
    const title = await cartPage.getTitle();
    expect(title).toBe(MESSAGES.cartTitle);
  });

  test('@regression TC-C04: Cart shows empty state when no items added', async () => {
    await inventoryPage.goToCart();
    const count = await cartPage.getCartItemCount();
    expect(count).toBe(0);
  });

  test('@regression TC-C05: Added item appears in cart with correct name', async ({ page }) => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.goToCart();
    const names = await cartPage.getCartItemNames();
    expect(names).toContain(PRODUCTS.backpack.name);
  });

  test('@regression TC-C06: Added item appears in cart with correct price', async () => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.goToCart();
    const prices = await cartPage.getCartItemPrices();
    expect(prices).toContain(29.99);
  });

});
