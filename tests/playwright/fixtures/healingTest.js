const base = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Generic, per-test failure capture — replaces hardcoded per-module
// "reproduce" navigation scripts entirely. Instead of guessing how to get
// back to a similar page after the fact, this captures the REAL DOM/URL at
// the exact moment the test actually failed, for every test, automatically.
// The AI Healing Agent reads this artifact directly (see
// backend/src/services/demoHealingAgent.service.js) instead of re-deriving
// app-specific navigation steps.
const CAPTURE_DIR = path.join(__dirname, '..', '..', 'test-results', 'failure-context');

function captureKeyFor(testTitle) {
  return testTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 150);
}

const test = base.test.extend({
  page: async ({ page }, use, testInfo) => {
    await use(page);
    if (testInfo.status === testInfo.expectedStatus) return; // test passed — nothing to capture

    try {
      const html = await page.content();
      const url = page.url();
      fs.mkdirSync(CAPTURE_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(CAPTURE_DIR, `${captureKeyFor(testInfo.title)}.json`),
        JSON.stringify({ html, url, title: testInfo.title, capturedAt: Date.now() })
      );
    } catch {
      // Best-effort — a capture failure must never mask the real test failure.
    }
  },
});

module.exports = { test, expect: base.expect, captureKeyFor, CAPTURE_DIR };
