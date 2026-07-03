const { test, expect } = require('@playwright/test');
const { InventoryPage } = require('../../pages/InventoryPage');
const { ProductDetailPage } = require('../../pages/ProductDetailPage');
const { loginAs } = require('../../helpers/auth.helper');
const { PRODUCTS, SORT_OPTIONS } = require('../../fixtures/testData');

test.describe('SauceDemo - Product/Inventory Tests', () => {
  let inventoryPage;

  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'standard');
    inventoryPage = new InventoryPage(page);
  });

  // ─── Smoke Tests ──────────────────────────────────────────────────────────

  test('@smoke TC-P01: Inventory page displays all 6 products', async () => {
    const count = await inventoryPage.getProductCount();
    expect(count).toBe(6);
  });

  test('@smoke TC-P02: Inventory page title is "Products"', async () => {
    const title = await inventoryPage.getTitle();
    expect(title).toBe('Products');
  });

  // ─── Regression Tests ─────────────────────────────────────────────────────

  test('@regression TC-P03: All expected product names are displayed', async () => {
    const names = await inventoryPage.getProductNames();
    expect(names).toContain(PRODUCTS.backpack.name);
    expect(names).toContain(PRODUCTS.bikeLight.name);
    expect(names).toContain(PRODUCTS.boltTShirt.name);
    expect(names).toContain(PRODUCTS.fleeceJacket.name);
    expect(names).toContain(PRODUCTS.onesie.name);
    expect(names).toContain(PRODUCTS.tShirtRed.name);
  });

  test('@regression TC-P04: All product prices are displayed and are positive', async () => {
    const prices = await inventoryPage.getProductPrices();
    expect(prices.length).toBe(6);
    prices.forEach(price => expect(price).toBeGreaterThan(0));
  });

  test('@regression TC-P05: Sort by Name A-Z works correctly', async () => {
    await inventoryPage.sortBy(SORT_OPTIONS.nameAZ);
    const names = await inventoryPage.getProductNames();
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  test('@regression TC-P06: Sort by Name Z-A works correctly', async () => {
    await inventoryPage.sortBy(SORT_OPTIONS.nameZA);
    const names = await inventoryPage.getProductNames();
    const sorted = [...names].sort().reverse();
    expect(names).toEqual(sorted);
  });

  test('@regression TC-P07: Sort by Price Low to High works correctly', async () => {
    await inventoryPage.sortBy(SORT_OPTIONS.priceLowHigh);
    const prices = await inventoryPage.getProductPrices();
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }
  });

  test('@regression TC-P08: Sort by Price High to Low works correctly', async () => {
    await inventoryPage.sortBy(SORT_OPTIONS.priceHighLow);
    const prices = await inventoryPage.getProductPrices();
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
    }
  });

  test('@regression TC-P09: Each product has an image', async ({ page }) => {
    // SauceDemo product images are <img> tags inside inventory items
    const images = page.locator('[data-test="inventory-item"] img');
    const count = await images.count();
    expect(count).toBe(6);
    for (let i = 0; i < count; i++) {
      await expect(images.nth(i)).toBeVisible();
    }
  });

  test('@regression TC-P10: Each product has a description', async ({ page }) => {
    const descs = await page.locator('[data-test="inventory-item-desc"]').allTextContents();
    expect(descs.length).toBe(6);
    descs.forEach(desc => expect(desc.trim().length).toBeGreaterThan(0));
  });

  test('@regression TC-P11: Clicking product name navigates to detail page', async ({ page }) => {
    await inventoryPage.clickProduct(PRODUCTS.backpack.name);
    await page.waitForURL(/inventory-item\.html/);
    const detailPage = new ProductDetailPage(page);
    const name = await detailPage.getName();
    expect(name).toBe(PRODUCTS.backpack.name);
  });

  test('@regression TC-P12: Clicking product image navigates to detail page', async ({ page }) => {
    await page.locator('[data-test="item-4-img-link"]').click();
    await page.waitForURL(/inventory-item\.html/);
    await expect(page.locator('[data-test="inventory-item-name"]')).toBeVisible();
  });

  test('@regression TC-P13: Product detail page shows correct price', async ({ page }) => {
    await inventoryPage.clickProduct(PRODUCTS.backpack.name);
    const detailPage = new ProductDetailPage(page);
    const price = await detailPage.getPrice();
    expect(price).toBe(29.99);
  });

  test('@regression TC-P14: Back to Products button on detail page works', async ({ page }) => {
    await inventoryPage.clickProduct(PRODUCTS.backpack.name);
    const detailPage = new ProductDetailPage(page);
    await detailPage.backToProducts();
    await expect(page).toHaveURL(/inventory\.html/);
  });

  test('@regression TC-P15: Add to Cart from detail page updates cart badge', async ({ page }) => {
    await inventoryPage.clickProduct(PRODUCTS.backpack.name);
    const detailPage = new ProductDetailPage(page);
    await detailPage.addToCart();
    const count = await detailPage.getCartCount();
    expect(count).toBe(1);
  });

  test('@regression TC-P16: Add to Cart button changes to Remove after click', async ({ page }) => {
    await inventoryPage.addItemToCartById(PRODUCTS.backpack.id);
    const removeBtn = page.locator(`[data-test="remove-${PRODUCTS.backpack.id}"]`);
    await expect(removeBtn).toBeVisible();
  });

  test('@regression TC-P17: Shopping cart icon is visible on inventory page', async ({ page }) => {
    await expect(inventoryPage.shoppingCartLink).toBeVisible();
  });

  test('@regression TC-P18: Hamburger menu opens correctly', async ({ page }) => {
    await inventoryPage.openMenu();
    await expect(page.locator('[data-test="logout-sidebar-link"]')).toBeVisible();
    await expect(page.locator('[data-test="inventory-sidebar-link"]')).toBeVisible();
    await expect(page.locator('[data-test="about-sidebar-link"]')).toBeVisible();
    await expect(page.locator('[data-test="reset-sidebar-link"]')).toBeVisible();
  });
});
