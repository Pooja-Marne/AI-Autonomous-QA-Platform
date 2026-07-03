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

  test('@regression TC-CH06: Error shown when Postal Code is missing', async () => {
    await checkoutPage.fillInfo(CHECKOUT_INFO.valid.firstName, CHECKOUT_INFO.valid.lastName, '');
    await checkoutPage.continue();
    const msg = await checkoutPage.getErrorMessage();
    expect(msg).toContain(MESSAGES.checkoutPostalCode);
  });

  test('@regression TC-CH07: Cancel on step 1 returns to cart', async ({ page }) => {
    await checkoutPage.cancel();
    await expect(page).toHaveURL(/cart\.html/);
  });

  test('@regression TC-CH08: Checkout overview page shows correct title', async () => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    const title = await checkoutPage.getTitle();
    expect(title).toBe(MESSAGES.checkoutOverviewTitle);
  });

  test('@regression TC-CH09: Checkout overview shows ordered items', async () => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    const names = await checkoutPage.getOverviewItemNames();
    expect(names).toContain(PRODUCTS.backpack.name);
  });

  test('@regression TC-CH10: Subtotal is correct in overview', async () => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    const subtotal = await checkoutPage.getSubtotal();
    expect(subtotal).toBe(29.99);
  });

  test('@regression TC-CH11: Tax is calculated and displayed', async () => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    const tax = await checkoutPage.getTax();
    expect(tax).toBeGreaterThan(0);
  });

  test('@regression TC-CH12: Total = subtotal + tax', async () => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    const subtotal = await checkoutPage.getSubtotal();
    const tax = await checkoutPage.getTax();
    const total = await checkoutPage.getTotal();
    expect(total).toBeCloseTo(subtotal + tax, 2);
  });

  test('@regression TC-CH13: Cancel on overview returns to inventory', async ({ page }) => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    await checkoutPage.cancel();
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test('@regression TC-CH14: Checkout complete page has confirmation title', async () => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    await checkoutPage.finish();
    const title = await checkoutPage.getTitle();
    expect(title).toBe(MESSAGES.checkoutCompleteTitle);
  });

  test('@regression TC-CH15: Pony Express image shown on completion', async ({ page }) => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    await checkoutPage.finish();
    await expect(checkoutPage.ponyExpressImage).toBeVisible();
  });

  test('@regression TC-CH16: Back Home button after order returns to inventory', async ({ page }) => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    await checkoutPage.finish();
    await checkoutPage.backToHome();
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test('@regression TC-CH17: Cart is empty after completing order', async ({ page }) => {
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();
    await checkoutPage.finish();
    await checkoutPage.backToHome();
    const cartBadge = page.locator('[data-test="shopping-cart-badge"]');
    await expect(cartBadge).not.toBeVisible();
  });
});
