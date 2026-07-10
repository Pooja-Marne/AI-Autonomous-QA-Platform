const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/LoginPage');
const { UsersPage } = require('../pages/UsersPage');

test.describe('Users', () => {
  test.beforeEach(async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginAsAdmin();
  });

  test('@add-user @smoke Adding a user shows it in the users table', async ({ page }) => {
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.addUser('newtester', 'Viewer', 'active');
    await expect(usersPage.rowByUsername('newtester')).toBeVisible();
    await expect(usersPage.rowByUsername('newtester')).toContainText('Viewer');
  });

  test('@add-user Adding a user with an empty username shows a validation toast', async ({ page }) => {
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.addUserButton.click();
    await usersPage.saveUserButton.click();
    await expect(page.locator('#toast')).toContainText('Username is required.');
  });

  test('@edit-user Editing a user updates their role and status', async ({ page }) => {
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await usersPage.editUser('bob');
    await usersPage.roleSelect.selectOption('Manager');
    await usersPage.statusSelect.selectOption('active');
    await usersPage.saveUserButton.click();
    await expect(usersPage.rowByUsername('bob')).toContainText('Manager');
    await expect(usersPage.rowByUsername('bob')).toContainText('active');
  });

  test('@delete-user Deleting a user removes them from the table', async ({ page }) => {
    const usersPage = new UsersPage(page);
    await usersPage.goto();
    await expect(usersPage.rowByUsername('jane')).toBeVisible();
    await usersPage.deleteUser('jane');
    await expect(usersPage.rowByUsername('jane')).toHaveCount(0);
  });
});
