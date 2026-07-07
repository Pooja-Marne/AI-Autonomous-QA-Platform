const { resolve } = require('../demo/locatorResolver');

class CheckoutPage {
  constructor(page) {
    this.page = page;
    // Step 1 - Your Information
    // firstNameInput is DEMO_MODE-controlled (see tests/playwright/demo/) —
    // intentionally broken while DEMO_MODE=true to give the AI Healing Agent
    // something real to detect and fix during live demos.
    this.firstNameInput = page.locator(resolve('CheckoutPage.firstNameInput'));
    this.lastNameInput = page.locator('[data-test="broken_lastName"]');
    this.postalCodeInput = page.locator('[data-test="postalCode"]');
    this.continueBtn = page.locator('[data-test="continue"]');
    this.cancelBtn = page.locator('[data-test="cancel"]');
    this.errorMessage = page.locator('[data-test="error"]');

    // Step 2 - Overview
    this.finishBtn = page.locator('[data-test="finish"]');
    this.overviewItems = page.locator('[data-test="cart-item"]');
    this.subtotalLabel = page.locator('[data-test="subtotal-label"]');
    this.taxLabel = page.locator('[data-test="tax-label"]');
    this.totalLabel = page.locator('[data-test="total-label"]');

    // Step 3 - Complete
    this.completeHeader = page.locator('[data-test="complete-header"]');
    this.completeText = page.locator('[data-test="complete-text"]');
    this.backHomeBtn = page.locator('[data-test="back-to-products"]');
    this.ponyExpressImage = page.locator('[data-test="pony-express"]');

    this.title = page.locator('[data-test="title"]');
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
