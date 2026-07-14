const { defineConfig, devices } = require('@playwright/test');
const { loadEnv } = require('./loadEnv');

loadEnv();

module.exports = defineConfig({
  testDir: './playwright/specs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 1 retry everywhere: the deployed demo site is a separate service
  // (Render) reached over the network from wherever this runs (Railway in
  // production, a laptop locally) — real network jitter between services
  // is a genuine flakiness source, not just something to eliminate for speed.
  retries: 1,
  workers: process.env.CI ? 1 : 4,
  timeout: 25000,
  expect: { timeout: 10000 },

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
    // Deliberately not cut too aggressively: the deployed demo site is
    // reached over real inter-service network hops (Railway -> Render),
    // and 6s/10s genuinely caused real retries to fail there even with the
    // correct locator applied — this is the safer middle ground.
    actionTimeout: 12000,
    navigationTimeout: 20000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    }
  ],
});
