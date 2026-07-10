const { resolve } = require('../locators/resolve');

class LoginPage {
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator(resolve('LoginPage.usernameInput', '[data-test="broken_username"]'));
    this.passwordInput = page.locator(resolve('LoginPage.passwordInput', '[data-test="password"]'));
    // loginButton is DEMO_MODE-controlled (see tests/playwright/demo/) —
    // intentionally broken while DEMO_MODE=true to give the AI Healing Agent
    // something real to detect and fix during live demos.
    this.loginButton = page.locator(resolve('LoginPage.loginButton', '[data-test="login-button"]'));
    this.errorMessage = page.locator(resolve('LoginPage.errorMessage', '[data-test="error"]'));
    this.errorIcon = page.locator(resolve('LoginPage.errorIcon', '.error_icon'));
    this.loginLogo = page.locator(resolve('LoginPage.loginLogo', '.login_logo'));
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async login(username, password) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async loginAsStandardUser() {
    await this.login('standard_user', 'secret_sauce');
  }

  async loginAsLockedUser() {
    await this.login('locked_out_user', 'secret_sauce');
  }

  async loginAsPerformanceGlitchUser() {
    await this.login('performance_glitch_user', 'secret_sauce');
  }

  async getErrorMessage() {
    return await this.errorMessage.textContent();
  }

  async isErrorVisible() {
    return await this.errorMessage.isVisible();
  }

  async clearInputs() {
    await this.usernameInput.clear();
    await this.passwordInput.clear();
  }

  async isLoginPageVisible() {
    return await this.loginLogo.isVisible();
  }
}

module.exports = { LoginPage };
