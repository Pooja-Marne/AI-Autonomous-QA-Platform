const { test, expect } = require('@playwright/test');
const { InventoryPage } = require('../../pages/InventoryPage');
const { CartPage } = require('../../pages/CartPage');
const { CheckoutPage } = require('../../pages/CheckoutPage');
const { loginAs } = require('../../helpers/auth.helper');
const { PRODUCTS, CHECKOUT_INFO, MESSAGES } = require('../../fixtures/testData');

test.describe('SauceDemo - Checkout Tests', () => {
  let inventoryPage;
  let cartPage;
  let checkoutPage;

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'standard');
    inventoryPage = new InventoryPage(page);
    cartPage = new CartPage(page);
    checkoutPage = new CheckoutPage(page);

    // Add a product and navigate to checkout
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.goToCart();
    await cartPage.proceedToCheckout();
  });

  // ─── Smoke Tests ──────────────────────────────────────────────────────────

  test('@smoke TC-CH01: Checkout step 1 page loads with correct title', async () => {
    const title = await checkoutPage.getTitle();
    expect(title).toBe(MESSAGES.checkoutTitle);
  });

  test('@smoke TC-CH02: Completing checkout flow shows order confirmation', async ({ page }) => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    await checkoutPage.finish();
    const header = await checkoutPage.getCompleteHeader();
    expect(header).toBe(MESSAGES.orderComplete);
  });

  // ─── Regression Tests ─────────────────────────────────────────────────────

  test('@regression TC-CH03: Checkout step 1 has all required fields', async ({ page }) => {
    await expect(checkoutPage.firstNameInput).toBeVisible();
    await expect(checkoutPage.lastNameInput).toBeVisible();
    await expect(checkoutPage.postalCodeInput).toBeVisible();
    await expect(checkoutPage.continueBtn).toBeVisible();
    await expect(checkoutPage.cancelBtn).toBeVisible();
  });

  test('@regression TC-CH04: Error shown when First Name is missing', async () => {
    await checkoutPage.fillInfo('', CHECKOUT_INFO.valid.lastName, CHECKOUT_INFO.valid.postalCode);
    await checkoutPage.continue();
    const msg = await checkoutPage.getErrorMessage();
    expect(msg).toContain(MESSAGES.checkoutFirstName);
  });

  test('@regression TC-CH05: Error shown when Last Name is missing', async () => {
    await checkoutPage.fillInfo(CHECKOUT_INFO.valid.firstName, '', CHECKOUT_INFO.valid.postalCode);
    await checkoutPage.continue();
    const msg = await checkoutPage.getErrorMessage();
    expect(msg).toContain(MESSAGES.checkoutLastName);
  });

});
