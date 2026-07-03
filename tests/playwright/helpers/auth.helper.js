const { LoginPage } = require('../pages/LoginPage');
const { InventoryPage } = require('../pages/InventoryPage');

async function loginAs(page, user = 'standard') {
  const credentials = {
    standard: { username: 'standard_user', password: 'secret_sauce' },
    locked: { username: 'locked_out_user', password: 'secret_sauce' },
    performance: { username: 'performance_glitch_user', password: 'secret_sauce' },
    error: { username: 'error_user', password: 'secret_sauce' },
    visual: { username: 'visual_user', password: 'secret_sauce' },
  };

  const creds = credentials[user];
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(creds.username, creds.password);

  if (user !== 'locked') {
    await page.waitForURL('**/inventory.html', { timeout: 15000 });
  }
}

async function loginAndGetInventory(page) {
  await loginAs(page, 'standard');
  return new InventoryPage(page);
}

module.exports = { loginAs, loginAndGetInventory };
