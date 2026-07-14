const { defineConfig, devices } = require('@playwright/test');
const { loadEnv } = require('./loadEnv');

loadEnv();

module.exports = defineConfig({
  testDir: './playwright/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Local/demo runs don't retry: Playwright's own retry doubles the time of
  // every genuinely-failing test before our self-healing pipeline even sees
  // it, and healing already re-verifies with a real retry of its own once a
  // fix is found. CI keeps 1 retry as flakiness tolerance.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : 4,
  timeout: 20000,
  expect: { timeout: 8000 },

  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:8080',
    headless: true,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    // Shorter than the previous 15s/30s: this demo site responds near-
    // instantly, so a genuinely broken locator now fails fast instead of
    // making every test wait out a timeout sized for a slow real app.
    actionTimeout: 6000,
    navigationTimeout: 10000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],
});
