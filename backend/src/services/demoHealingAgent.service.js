const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const config = require('../config/config');
const { getDatabase } = require('../config/database');

const TESTS_DIR = config.automation.repoPath;
const LOCATORS_PATH = path.join(TESTS_DIR, 'playwright', 'demo', 'demoLocators.json');
const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'data', 'demo-artifacts');
const BASE_URL = 'https://www.saucedemo.com'; // must match tests/playwright.config.js use.baseURL

const openai = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseURL });

// Real (not simulated) reproduction steps + metadata for every locator that
// can be intentionally broken via tests/playwright/demo/demoLocators.json.
// Detection is keyed off the actual broken selector STRING (see
// findBrokenLocatorInMessage below), not which spec file failed — a shared
// page object like LoginPage is exercised by many suites, not just its own.
const LOCATOR_TARGETS = {
  'LoginPage.loginButton': {
    propertyName: 'loginButton',
    specArg: 'specs/auth/',
    elementDescription: 'the Login submit button on the SauceDemo login page',
    reproduce: async (page) => {
      await page.goto(BASE_URL);
    },
  },
  'CheckoutPage.firstNameInput': {
    propertyName: 'firstNameInput',
    specArg: 'specs/checkout/',
    elementDescription: 'the First Name input field on the SauceDemo checkout step-one form',
    reproduce: async (page) => {
      await page.goto(BASE_URL);
      await page.locator('[data-test="username"]').fill('standard_user');
      await page.locator('[data-test="password"]').fill('secret_sauce');
      await page.locator('[data-test="login-button"]').click();
      await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
      await page.locator('.shopping_cart_link').click();
      await page.locator('[data-test="checkout"]').click();
    },
  },
};

function loadLocatorConfig() {
  return JSON.parse(fs.readFileSync(LOCATORS_PATH, 'utf-8'));
}

function saveLocatorConfig(cfg) {
  fs.writeFileSync(LOCATORS_PATH, JSON.stringify(cfg, null, 2));
}

// Finds a registered broken locator by checking whether its exact selector
// string appears in the failure text — this is how Playwright errors work
// ("waiting for locator('[data-test=\"broken_login_button\"]')"), so it's a
// reliable, generic signal regardless of which spec/test surfaced it.
function findBrokenLocatorInMessage(message) {
  if (!message) return null;
  const demoConfig = loadLocatorConfig();
  for (const [locatorKey, entry] of Object.entries(demoConfig)) {
    if (entry.broken && message.includes(entry.broken)) {
      return { locatorKey, oldLocator: entry.broken };
    }
  }
  return null;
}

function stripForPrompt(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000);
}

async function analyzeWithAI({ elementDescription, oldLocator, domSnapshot }) {
  const prompt = `You are an expert Playwright test engineer performing live root-cause analysis on a broken locator.

Element we're trying to locate: ${elementDescription}
Locator that is currently failing: ${oldLocator}
Live DOM snapshot of the page (HTML, truncated):
${stripForPrompt(domSnapshot)}

The locator above does not match anything in the live DOM. Find the real element in the DOM snapshot that serves the same purpose, and propose a robust CSS selector for it (prefer data-test/data-testid attributes when present).

Respond in JSON:
{
  "rootCause": "<one or two sentences explaining exactly why the old locator no longer matches, referencing what you actually found in the DOM>",
  "suggestedLocator": "<a single CSS selector string>",
  "confidence": <integer 0-100>
}`;

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: 'You are an expert automated QA engineer specializing in Playwright locator healing.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });
    const result = JSON.parse(response.choices[0].message.content);
    return {
      rootCause: result.rootCause || 'AI could not determine a root cause.',
      suggestedLocator: result.suggestedLocator || null,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
    };
  } catch (err) {
    return { rootCause: `AI analysis failed: ${err.message}`, suggestedLocator: null, confidence: 0 };
  }
}

function retrySpecFile(specArg) {
  return new Promise((resolve) => {
    const args = ['playwright', 'test', specArg, '--project=chromium', '--reporter=json'];
    const proc = spawn('npx', args, { cwd: TESTS_DIR, shell: true, timeout: 120000 });
    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.on('close', () => {
      try {
        const jsonStart = stdout.indexOf('{');
        const results = JSON.parse(stdout.substring(jsonStart));
        const total = results.stats?.expected + results.stats?.unexpected + results.stats?.flaky || 0;
        const failed = results.stats?.unexpected || 0;
        resolve({ passed: failed === 0 && total > 0, totalCount: total, passedCount: total - failed });
      } catch {
        resolve({ passed: false, totalCount: 0, passedCount: 0 });
      }
    });
    proc.on('error', () => resolve({ passed: false, totalCount: 0, passedCount: 0 }));
  });
}

function persistDemoHealingRun(r) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO demo_healing_runs (
      id, run_id, locator_key, test_file, failed_tests, old_locator, new_locator,
      root_cause, confidence_score, live_verified, healing_status, retry_status,
      screenshot_path, trace_path, dom_snapshot_path, time_taken_ms, logs
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...[
    r.id, r.runId, r.locatorKey, r.testFile, JSON.stringify(r.failedTests || []),
    r.oldLocator, r.newLocator, r.rootCause, r.confidenceScore, r.liveVerified ? 1 : 0,
    r.healingStatus, r.retryStatus, r.screenshotPath, r.tracePath, r.domSnapshotPath,
    r.timeTakenMs, JSON.stringify(r.logs || []),
  ].map((v) => (v === undefined ? null : v))); // node:sqlite rejects `undefined` bind values outright
}

function buildCodeSnippet(locatorKey, propertyName, locator) {
  if (!locator) return null;
  const [pageObject] = locatorKey.split('.');
  return `// ${pageObject}.js\nthis.${propertyName} = page.locator('${locator}');`;
}

// Runs the full real healing cycle for a recognized broken locator: capture
// real artifacts from the live app, ask the AI to analyze the real DOM,
// verify its suggestion against the live page, apply it, and retry the real
// spec file. On success the fix STAYS applied (demoLocators.json's `healed`
// field is not reverted) — call resetDemoLocators() to re-arm the bait
// locators for another demo run.
async function runRealHealingCycle({ locatorKey, runId = null, testFile = null, failedTestNames = [] }) {
  const meta = LOCATOR_TARGETS[locatorKey];
  if (!meta) return null;

  const startedAt = Date.now();
  const logs = [];
  const log = (message) => {
    logs.push({ ts: Date.now(), message });
    console.log(`[Self-Healing] ${message}`);
  };

  log(`Detected broken locator "${locatorKey}"${testFile ? ` (surfaced via ${testFile})` : ''}`);

  const demoConfig = loadLocatorConfig();
  const oldLocator = demoConfig[locatorKey].broken;

  const modulePath = path.join(TESTS_DIR, 'node_modules', '@playwright', 'test');
  const { chromium } = require(modulePath);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();

  // Stored/returned paths are relative to ARTIFACTS_DIR (served statically at
  // /demo-artifacts by index.js) so the frontend can link/embed them directly.
  const artifactSubdir = `${runId || uuidv4()}-${locatorKey.replace(/\W+/g, '_')}`;
  const artifactDir = path.join(ARTIFACTS_DIR, artifactSubdir);
  fs.mkdirSync(artifactDir, { recursive: true });
  const screenshotPath = `${artifactSubdir}/screenshot.png`;
  const domSnapshotPath = `${artifactSubdir}/dom.html`;
  const tracePath = `${artifactSubdir}/trace.zip`;
  const screenshotAbsPath = path.join(artifactDir, 'screenshot.png');
  const domSnapshotAbsPath = path.join(artifactDir, 'dom.html');
  const traceAbsPath = path.join(artifactDir, 'trace.zip');

  let record;
  try {
    await meta.reproduce(page);
    log('Reproduced the failure state live against the real application');

    await page.screenshot({ path: screenshotAbsPath, fullPage: true });
    log(`Captured screenshot -> ${screenshotPath}`);

    const domContent = await page.content();
    fs.writeFileSync(domSnapshotAbsPath, domContent);
    log(`Captured DOM snapshot -> ${domSnapshotPath}`);

    await context.tracing.stop({ path: traceAbsPath });
    log(`Saved Playwright trace -> ${tracePath}`);

    log('Sending real DOM + error context to AI for root-cause analysis...');
    const analysis = await analyzeWithAI({ elementDescription: meta.elementDescription, oldLocator, domSnapshot: domContent });
    log(`AI root cause: ${analysis.rootCause}`);
    log(`AI suggested locator: ${analysis.suggestedLocator} (confidence ${analysis.confidence}%)`);

    let liveVerified = false;
    if (analysis.suggestedLocator) {
      log('Validating AI-suggested locator against the live DOM...');
      const matchCount = await page.locator(analysis.suggestedLocator).count().catch(() => 0);
      liveVerified = matchCount === 1;
      log(liveVerified ? 'Live validation passed — selector resolves to exactly 1 element' : `Live validation failed — selector matched ${matchCount} element(s)`);
    }

    let retryStatus = 'skipped';
    let healingStatus = 'not_fixable';

    if (liveVerified) {
      demoConfig[locatorKey].healed = analysis.suggestedLocator;
      saveLocatorConfig(demoConfig);
      log('Applied AI-generated locator and retrying the real spec file...');

      const retry = await retrySpecFile(meta.specArg);
      retryStatus = retry.passed ? 'passed' : 'failed';
      healingStatus = retry.passed ? 'healed' : 'not_fixable';
      log(`Retry result: ${retryStatus.toUpperCase()} (${retry.passedCount}/${retry.totalCount} tests passing)`);

      if (!retry.passed) {
        // The fix didn't actually make the test pass — don't leave a
        // non-working override in place.
        demoConfig[locatorKey].healed = null;
        saveLocatorConfig(demoConfig);
      }
    } else {
      log('Could not verify a working replacement live. Flagging for manual review with the best AI suggestion attached.');
    }

    const timeTakenMs = Date.now() - startedAt;
    record = {
      id: uuidv4(), runId, locatorKey, testFile, failedTests: failedTestNames,
      oldLocator, newLocator: analysis.suggestedLocator, rootCause: analysis.rootCause,
      confidenceScore: analysis.confidence, liveVerified, healingStatus, retryStatus,
      screenshotPath, tracePath, domSnapshotPath, timeTakenMs, logs,
      codeSnippet: healingStatus === 'healed' ? buildCodeSnippet(locatorKey, meta.propertyName, analysis.suggestedLocator) : null,
    };
    persistDemoHealingRun(record);
    log(`Healing cycle complete in ${timeTakenMs}ms — status: ${healingStatus.toUpperCase()}`);
  } finally {
    await browser.close();
  }

  return record;
}

// Clears every locator's `healed` override back to null, re-arming the bait
// locators (still `broken` while DEMO_MODE=true) for another live demo.
function resetDemoLocators() {
  const cfg = loadLocatorConfig();
  for (const key of Object.keys(cfg)) cfg[key].healed = null;
  saveLocatorConfig(cfg);
  return cfg;
}

function getDemoHealingRuns({ limit = 50 } = {}) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM demo_healing_runs ORDER BY created_at DESC LIMIT ?').all(limit).map((r) => ({
    ...r,
    failedTests: JSON.parse(r.failed_tests || '[]'),
    logs: JSON.parse(r.logs || '[]'),
    liveVerified: Boolean(r.live_verified),
    code_snippet: r.healing_status === 'healed'
      ? buildCodeSnippet(r.locator_key, LOCATOR_TARGETS[r.locator_key]?.propertyName, r.new_locator)
      : null,
  }));
}

module.exports = { runRealHealingCycle, findBrokenLocatorInMessage, resetDemoLocators, getDemoHealingRuns };
