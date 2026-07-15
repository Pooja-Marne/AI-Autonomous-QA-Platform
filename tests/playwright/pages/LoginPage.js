const { resolve } = require('../locators/resolve');

class LoginPage {
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator(resolve('LoginPage.usernameInput', '[data-test="broken-username-input"]'));
    this.passwordInput = page.locator(resolve('LoginPage.passwordInput', '[data-test="password-input"]'));
    this.loginButton = page.locator(resolve('LoginPage.loginButton', '[data-test="login"]'));
    this.errorText = page.locator(resolve('LoginPage.errorText', '[data-test="login-error"]'));
  }

  async goto() {
    await this.page.goto('/login.html');
  }

  async login(username, password) {
    await this.usernameInput.fill(username);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }

  async loginAsAdmin() {
    await this.login('admin', 'admin123');
    await this.page.waitForURL('**/dashboard.html');
  }
}

module.exports = { LoginPage };
