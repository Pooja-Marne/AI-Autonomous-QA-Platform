const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../../pages/LoginPage');
const { InventoryPage } = require('../../pages/InventoryPage');
const { CartPage } = require('../../pages/CartPage');
const { CheckoutPage } = require('../../pages/CheckoutPage');
const { USERS, PRODUCTS, CHECKOUT_INFO, MESSAGES } = require('../../fixtures/testData');

test.describe('SauceDemo - Full E2E Purchase Flow', () => {

  test('@smoke @e2e TC-E2E01: Complete purchase flow — single item', async ({ page }) => {
    // 1. Login
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(USERS.standard.username, USERS.standard.password);
    await page.waitForURL('**/inventory.html');

    // 2. Add item to cart
    const inventoryPage = new InventoryPage(page);
    await expect(inventoryPage.inventoryContainer).toBeVisible();
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    expect(await inventoryPage.getCartCount()).toBe(1);

    // 3. View cart
    await inventoryPage.goToCart();
    const cartPage = new CartPage(page);
    await expect(page).toHaveURL(/cart\.html/);
    const cartNames = await cartPage.getCartItemNames();
    expect(cartNames).toContain(PRODUCTS.backpack.name);

    // 4. Checkout - step 1
    await cartPage.proceedToCheckout();
    await expect(page).toHaveURL(/checkout-step-one\.html/);
    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.fillInfo(
      CHECKOUT_INFO.valid.firstName,
      CHECKOUT_INFO.valid.lastName,
      CHECKOUT_INFO.valid.postalCode
    );
    await checkoutPage.continue();

    // 5. Checkout - overview
    await expect(page).toHaveURL(/checkout-step-two\.html/);
    const itemNames = await checkoutPage.getOverviewItemNames();
    expect(itemNames).toContain(PRODUCTS.backpack.name);
    const total = await checkoutPage.getTotal();
    expect(total).toBeGreaterThan(0);

    // 6. Finish order
    await checkoutPage.finish();
    await expect(page).toHaveURL(/checkout-complete\.html/);
    const header = await checkoutPage.getCompleteHeader();
    expect(header).toBe(MESSAGES.orderComplete);

    // 7. Back to products
    await checkoutPage.backToHome();
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test('@regression @e2e TC-E2E02: Complete purchase flow — multiple items', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsStandardUser();
    await page.waitForURL('**/inventory.html');

    const inventoryPage = new InventoryPage(page);

    // Add 3 items
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.addItemToCartById(PRODUCTS.bikeLight.id);
    await inventoryPage.addItemToCartById(PRODUCTS.boltTShirt.id);
    expect(await inventoryPage.getCartCount()).toBe(3);

    // Cart
    await inventoryPage.goToCart();
    const cartPage = new CartPage(page);
    expect(await cartPage.getCartItemCount()).toBe(3);

    // Checkout
    await cartPage.proceedToCheckout();
    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.fillInfo('Jane', 'Smith', '90210');
    await checkoutPage.continue();

    // Verify total = sum of all items + tax (29.99 + 9.99 + 15.99 = 55.97)
    const subtotal = await checkoutPage.getSubtotal();
    expect(subtotal).toBeCloseTo(55.97, 1);
    const tax = await checkoutPage.getTax();
    const total = await checkoutPage.getTotal();
    expect(total).toBeCloseTo(subtotal + tax, 2);

    await checkoutPage.finish();
    expect(await checkoutPage.getCompleteHeader()).toBe(MESSAGES.orderComplete);
  });

  test('@regression @e2e TC-E2E03: Sort products then purchase cheapest item', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsStandardUser();
    await page.waitForURL('**/inventory.html');

    const inventoryPage = new InventoryPage(page);

    // Sort by price low-high, cheapest is first
    await inventoryPage.sortBy('lohi');
    const prices = await inventoryPage.getProductPrices();
    expect(prices[0]).toBe(7.99); // Onesie

    // Add cheapest item
    await inventoryPage.addItemToCartById(PRODUCTS.onesie.id);
    expect(await inventoryPage.getCartCount()).toBe(1);

    // Go through checkout
    await inventoryPage.goToCart();
    const cartPage = new CartPage(page);
    await cartPage.proceedToCheckout();
    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.fillInfo('Test', 'User', '12345');
    await checkoutPage.continue();

    const subtotal = await checkoutPage.getSubtotal();
    expect(subtotal).toBe(7.99);

    await checkoutPage.finish();
    expect(await checkoutPage.isOrderComplete()).toBe(true);
  });

  test('@regression @e2e TC-E2E04: Remove item from cart during checkout flow', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsStandardUser();
    await page.waitForURL('**/inventory.html');

    const inventoryPage = new InventoryPage(page);
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    await inventoryPage.addItemToCartById(PRODUCTS.fleeceJacket.id);

    await inventoryPage.goToCart();
    const cartPage = new CartPage(page);

    // Remove one item from cart using ID for reliability
    await cartPage.removeItemById(PRODUCTS.fleeceJacket.id);
    expect(await cartPage.getCartItemCount()).toBe(1);

    // Complete purchase with remaining item
    await cartPage.proceedToCheckout();
    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.fillInfo('Alex', 'Johnson', '55555');
    await checkoutPage.continue();

    const subtotal = await checkoutPage.getSubtotal();
    expect(subtotal).toBe(29.99);

    await checkoutPage.finish();
    expect(await checkoutPage.getCompleteHeader()).toBe(MESSAGES.orderComplete);
  });

  test('@regression @e2e TC-E2E05: Login → logout → login again and complete purchase', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsStandardUser();
    await page.waitForURL('**/inventory.html');

    // Logout
    const inventoryPage = new InventoryPage(page);
    await inventoryPage.logout();
    await expect(page).toHaveURL('/');

    // Login again
    await loginPage.loginAsStandardUser();
    await page.waitForURL('**/inventory.html');

    // Purchase
    await inventoryPage.addItemToCartById(PRODUCTS.bikeLight.id);
    await inventoryPage.goToCart();
    const cartPage = new CartPage(page);
    await cartPage.proceedToCheckout();
    const checkoutPage = new CheckoutPage(page);
    await checkoutPage.fillInfo('Re', 'Login', '99999');
    await checkoutPage.continue();
    await checkoutPage.finish();
    expect(await checkoutPage.getCompleteHeader()).toBe(MESSAGES.orderComplete);
  });
});
