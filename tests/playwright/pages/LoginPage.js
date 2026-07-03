class LoginPage {
  constructor(page) {
    this.page = page;
    this.usernameInput = page.locator('[data-test="username"]');
    this.passwordInput = page.locator('[data-test="password"]');
    this.loginButton = page.locator('[data-test="login-button"]');
    this.errorMessage = page.locator('[data-test="error"]');
    this.errorIcon = page.locator('.error_icon');
    this.loginLogo = page.locator('.login_logo');
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
