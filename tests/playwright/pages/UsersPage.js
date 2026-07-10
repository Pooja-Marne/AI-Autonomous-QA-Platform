const { resolve } = require('../locators/resolve');

class UsersPage {
  constructor(page) {
    this.page = page;
    this.addUserButton = page.locator(resolve('UsersPage.addUserButton', '[data-test="add-user-button"]'));
    this.tableBody = page.locator(resolve('UsersPage.tableBody', '[data-test="users-table-body"]'));
    this.usernameInput = page.locator(resolve('UsersPage.usernameInput', '[data-test="user-username-input"]'));
    this.roleSelect = page.locator(resolve('UsersPage.roleSelect', '[data-test="user-role-select"]'));
    this.statusSelect = page.locator(resolve('UsersPage.statusSelect', '[data-test="user-status-select"]'));
    this.saveUserButton = page.locator(resolve('UsersPage.saveUserButton', '[data-test="save-user-button"]'));
  }

  async goto() {
    await this.page.goto('/users.html');
  }

  async addUser(username, role, status) {
    await this.addUserButton.click();
    await this.usernameInput.fill(username);
    await this.roleSelect.selectOption(role);
    await this.statusSelect.selectOption(status);
    await this.saveUserButton.click();
  }

  rowByUsername(username) {
    return this.page.locator('tr', { hasText: username });
  }

  async editUser(username) {
    await this.rowByUsername(username).locator('button', { hasText: 'Edit' }).click();
  }

  async deleteUser(username) {
    await this.rowByUsername(username).locator('button', { hasText: 'Delete' }).click();
  }
}

module.exports = { UsersPage };
