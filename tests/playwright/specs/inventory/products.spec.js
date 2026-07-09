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
});
