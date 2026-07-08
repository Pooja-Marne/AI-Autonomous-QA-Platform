const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('PAGEERROR: ' + err.message));

  await page.goto('http://localhost:3001/healing', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Fix Failure with AI', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'ui-shots/healing.png', fullPage: true });

  await page.goto('http://localhost:3001/jira', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Jira', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'ui-shots/jira-sprint.png', fullPage: true });

  await page.click('text=Triggers');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'ui-shots/jira-triggers.png', fullPage: true });

  await page.click('text=Test Execution Status');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'ui-shots/jira-execution.png', fullPage: true });

  console.log('CONSOLE_ERRORS:', JSON.stringify(errors));
  console.log('DONE');
  await browser.close();
})().catch((err) => {
  console.error('SCRIPT_FAILED:', err.message);
  process.exit(1);
});
