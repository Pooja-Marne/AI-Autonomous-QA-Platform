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

  test('@regression TC-C07: Adding multiple items updates cart badge correctly', async () => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.addItemToCartById(PRODUCTS.bikeLight.id);
    await inventoryPage.addItemToCartById(PRODUCTS.boltTShirt.id);
    const count = await inventoryPage.getCartCount();
    expect(count).toBe(3);
  });

  test('@regression TC-C08: All added items appear in cart', async () => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.addItemToCartById(PRODUCTS.bikeLight.id);
    await inventoryPage.goToCart();
    const names = await cartPage.getCartItemNames();
    expect(names).toContain(PRODUCTS.backpack.name);
    expect(names).toContain(PRODUCTS.bikeLight.name);
    expect(names.length).toBe(2);
  });

  test('@regression TC-C09: Removing item from cart decrements badge', async () => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.addItemToCartById(PRODUCTS.bikeLight.id);
    await inventoryPage.removeItemFromCartById(PRODUCTS.backpack.id);
    const count = await inventoryPage.getCartCount();
    expect(count).toBe(1);
  });

  test('@regression TC-C10: Removing item from cart page removes it from list', async () => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.addItemToCartById(PRODUCTS.bikeLight.id);
    await inventoryPage.goToCart();
    // Use ID-based removal for reliability
    await cartPage.removeItemById(PRODUCTS.backpack.id);
    const names = await cartPage.getCartItemNames();
    expect(names).not.toContain(PRODUCTS.backpack.name);
    expect(names).toContain(PRODUCTS.bikeLight.name);
  });

  test('@regression TC-C11: Cart quantity shows 1 for each item', async () => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.goToCart();
    const qty = await cartPage.getItemQuantity(PRODUCTS.backpack.name);
    expect(qty).toBe(1);
  });

  test('@regression TC-C12: Continue Shopping returns to inventory page', async ({ page }) => {
    await inventoryPage.goToCart();
    await cartPage.continueShopping();
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test('@regression TC-C13: Cart badge disappears when all items removed', async () => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.removeItemFromCartById(PRODUCTS.backpack.id);
    const count = await inventoryPage.getCartCount();
    expect(count).toBe(0);
  });

  test('@regression TC-C14: Cart persists items after navigating away and back', async ({ page }) => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.clickProduct(PRODUCTS.bikeLight.name);
    await page.goBack();
    const count = await inventoryPage.getCartCount();
    expect(count).toBe(1);
  });

  test('@regression TC-C15: Adding all 6 products shows badge count of 6', async () => {
    for (const product of Object.values(PRODUCTS)) {
      await inventoryPage.addItemToCartById(product.id);
    }
    const count = await inventoryPage.getCartCount();
    expect(count).toBe(6);
  });

  test('@regression TC-C16: Checkout button on cart navigates to checkout page', async ({ page }) => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.goToCart();
    await cartPage.proceedToCheckout();
    await expect(page).toHaveURL(/checkout-step-one\.html/);
  });
});
