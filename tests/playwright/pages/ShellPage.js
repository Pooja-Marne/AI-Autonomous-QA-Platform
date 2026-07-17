const { resolve } = require('../locators/resolve');

// Shared shell elements (sidebar nav + topbar) present on every page after login.
class ShellPage {
  constructor(page) {
    this.page = page;
    this.navMenu = page.locator(resolve('ShellPage.navMenu', '[data-test="nav-menu"]'));
    this.navDashboard = page.locator(resolve('ShellPage.navDashboard', '[data-test="nav-dashboard"]'));
    this.navUsers = page.locator(resolve('ShellPage.navUsers', '[data-test="nav-users"]'));
    this.logoutButton = page.locator(resolve('ShellPage.logoutButton', '[data-test="logout-button"]'));
    this.loggedInUser = page.locator(resolve('ShellPage.loggedInUser', '[data-test="logged-in-user"]'));
  }

  async logout() {
    await this.logoutButton.click();
    await this.page.waitForURL('**/login.html');
  }
}

module.exports = { ShellPage };
