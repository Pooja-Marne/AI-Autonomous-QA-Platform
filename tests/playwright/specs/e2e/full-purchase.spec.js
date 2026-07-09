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

 
});
