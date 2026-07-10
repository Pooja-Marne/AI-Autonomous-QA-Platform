const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { ProductsPage } = require('../pages/ProductsPage');

test.describe('Products', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsAdmin();
  });

  test('@add-product @smoke Adding a product shows it in the catalog table', async ({ page }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();
    await productsPage.addProduct('Test Webcam', 39.99, 25);
    await expect(productsPage.rowByName('Test Webcam')).toBeVisible();
    await expect(productsPage.rowByName('Test Webcam')).toContainText('$39.99');
  });

  test('@add-product Adding a product with empty fields shows a validation toast', async ({ page }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();
    await productsPage.addProductButton.click();
    await productsPage.saveProductButton.click();
    await expect(page.locator('#toast')).toContainText('Please fill in all fields.');
  });

  test('@delete-product Deleting a product removes it from the table', async ({ page }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();
    await expect(productsPage.rowByName('Wireless Mouse')).toBeVisible();
    await productsPage.deleteProductByName('Wireless Mouse');
    await expect(productsPage.rowByName('Wireless Mouse')).toHaveCount(0);
  });

  test('@search-product Searching filters the catalog to matching products', async ({ page }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();
    await productsPage.search('Keyboard');
    await expect(productsPage.rowByName('Mechanical Keyboard')).toBeVisible();
    await expect(productsPage.rowByName('Wireless Mouse')).toHaveCount(0);
  });

  test('@search-product Searching with no matches shows the empty state', async ({ page }) => {
    const productsPage = new ProductsPage(page);
    await productsPage.goto();
    await productsPage.search('Nonexistent Product XYZ');
    await expect(productsPage.emptyState).toBeVisible();
  });
});
