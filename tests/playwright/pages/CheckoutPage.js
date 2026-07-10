const { resolve } = require('../locators/resolve');

class CheckoutPage {
  constructor(page) {
    this.page = page;
    // Step 1 - Your Information
    // firstNameInput is DEMO_MODE-controlled (see tests/playwright/demo/) —
    // intentionally broken while DEMO_MODE=true to give the AI Healing Agent
    // something real to detect and fix during live demos.
    this.firstNameInput = page.locator(resolve('CheckoutPage.firstNameInput', '[data-test="firstName"]'));
    this.lastNameInput = page.locator(resolve('CheckoutPage.lastNameInput', '[data-test="lastName"]'));
    this.postalCodeInput = page.locator(resolve('CheckoutPage.postalCodeInput', '[data-test="postalCode"]'));
    this.continueBtn = page.locator(resolve('CheckoutPage.continueBtn', '[data-test="continue"]'));
    this.cancelBtn = page.locator(resolve('CheckoutPage.cancelBtn', '[data-test="cancel"]'));
    this.errorMessage = page.locator(resolve('CheckoutPage.errorMessage', '[data-test="error"]'));

    // Step 2 - Overview
    this.finishBtn = page.locator(resolve('CheckoutPage.finishBtn', '[data-test="finish"]'));
    this.overviewItems = page.locator(resolve('CheckoutPage.overviewItems', '[data-test="cart-item"]'));
    this.subtotalLabel = page.locator(resolve('CheckoutPage.subtotalLabel', '[data-test="subtotal-label"]'));
    this.taxLabel = page.locator(resolve('CheckoutPage.taxLabel', '[data-test="tax-label"]'));
    this.totalLabel = page.locator(resolve('CheckoutPage.totalLabel', '[data-test="total-label"]'));

    // Step 3 - Complete
    this.completeHeader = page.locator(resolve('CheckoutPage.completeHeader', '[data-test="complete-header"]'));
    this.completeText = page.locator(resolve('CheckoutPage.completeText', '[data-test="complete-text"]'));
    this.backHomeBtn = page.locator(resolve('CheckoutPage.backHomeBtn', '[data-test="back-to-products"]'));
    this.ponyExpressImage = page.locator(resolve('CheckoutPage.ponyExpressImage', '[data-test="pony-express"]'));

    this.title = page.locator(resolve('CheckoutPage.title', '[data-test="title"]'));
  }

  async getTitle() {
    return await this.title.textContent();
  }

  async fillInfo(firstName, lastName, postalCode) {
    await this.firstNameInput.fill(firstName);
    await this.lastNameInput.fill(lastName);
    await this.postalCodeInput.fill(postalCode);
  }

  async continue() {
    await this.continueBtn.click();
  }

  async cancel() {
    await this.cancelBtn.click();
  }

  async finish() {
    await this.finishBtn.click();
  }

  async backToHome() {
    await this.backHomeBtn.click();
  }

  async getErrorMessage() {
    return await this.errorMessage.textContent();
  }

  async isErrorVisible() {
    return await this.errorMessage.isVisible();
  }

  async getSubtotal() {
    const text = await this.subtotalLabel.textContent();
    return parseFloat(text.replace('Item total: $', ''));
  }

  async getTax() {
    const text = await this.taxLabel.textContent();
    return parseFloat(text.replace('Tax: $', ''));
  }

  async getTotal() {
    const text = await this.totalLabel.textContent();
    return parseFloat(text.replace('Total: $', ''));
  }

  async getCompleteHeader() {
    return await this.completeHeader.textContent();
  }

  async getOverviewItemCount() {
    return await this.overviewItems.count();
  }

  async getOverviewItemNames() {
    return await this.page.locator('[data-test="inventory-item-name"]').allTextContents();
  }

  async isOrderComplete() {
    return await this.completeHeader.isVisible();
  }
}

module.exports = { CheckoutPage };
