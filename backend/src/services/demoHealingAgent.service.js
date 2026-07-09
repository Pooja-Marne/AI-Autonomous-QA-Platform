const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const { getDatabase } = require('../config/database');

const TESTS_DIR = config.automation.repoPath;
const { loadEnv } = require(path.join(TESTS_DIR, 'loadEnv'));
loadEnv(path.join(TESTS_DIR, 'test.env'));

const PAGES_DIR = path.join(TESTS_DIR, 'playwright', 'pages');
const LOCATORS_PATH = path.join(TESTS_DIR, 'playwright', 'demo', 'demoLocators.json');
const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'data', 'demo-artifacts');
// Single source of truth (tests/test.env) shared with playwright.config.js —
// this is what "direct terminal execution" and "AI Agent execution" both
// resolve to now, instead of two independently hardcoded copies of the URL.
const BASE_URL = process.env.BASE_URL || 'https://www.saucedemo.com';

const openai = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseURL });
const anthropic = config.anthropic.apiKey ? new Anthropic({ apiKey: config.anthropic.apiKey }) : null;

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

// Real reproduction steps keyed by test MODULE (not by a specific known-
// broken locator) — this is what makes healing generalize to ANY selector
// failure, not just the 2 intentionally-broken demo locators above. Reuses
// the same live-navigation approach, just indexed more broadly.
const MODULE_REPRODUCE = {
  auth: async (page) => { await page.goto(BASE_URL); },
  inventory: async (page) => {
    await page.goto(BASE_URL);
    await page.locator('[data-test="username"]').fill('standard_user');
    await page.locator('[data-test="password"]').fill('secret_sauce');
    await page.locator('[data-test="login-button"]').click();
  },
  cart: async (page) => {
    await MODULE_REPRODUCE.inventory(page);
    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    await page.locator('.shopping_cart_link').click();
  },
  checkout: async (page) => {
    await MODULE_REPRODUCE.cart(page);
    await page.locator('[data-test="checkout"]').click();
  },
  e2e: async (page) => {
    await MODULE_REPRODUCE.checkout(page);
    await page.locator('[data-test="firstName"]').fill('Test');
    await page.locator('[data-test="lastName"]').fill('User');
    await page.locator('[data-test="postalCode"]').fill('12345');
    await page.locator('[data-test="continue"]').click();
  },
};

// Extracts the raw selector Playwright reported as unresolvable from a
// failure's error message — works for ANY broken locator, not just the 2
// registered in demoLocators.json. Playwright renders this consistently as
// locator('...') in both the short error and the "waiting for" log line.
function extractSelectorFromMessage(message) {
  if (!message) return null;
  const match = message.match(/locator\(\s*['"](.+?)['"]\s*\)/);
  return match ? match[1] : null;
}

// Finds which Page Object file/property currently hard-codes a selector
// string, and rewrites it in place — this IS the "centralized locator
// repository" update: the fix lands in real source, so the next run (from
// the terminal or the agent) uses the healed selector for real, not just an
// in-memory override.
function patchPageObjectSource(oldSelector, newSelector) {
  const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const filePath = path.join(PAGES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.includes(oldSelector)) continue;
    const propMatch = content.match(new RegExp(`this\\.(\\w+)\\s*=\\s*page\\.locator\\(['"\`]${oldSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\)`));
    const updated = content.split(oldSelector).join(newSelector);
    fs.writeFileSync(filePath, updated);
    return { file, className: file.replace('.js', ''), propertyName: propMatch?.[1] || null };
  }
  return null;
}

// In-progress healing cycles, keyed by runId — lets the UI poll live
// progress (which locator, what step, running log) instead of only seeing a
// result once persistDemoHealingRun() writes the final row at the very end.
const activeCycles = new Map();

function getActiveCycle(runId) {
  return runId ? activeCycles.get(runId) || null : null;
}

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

// Common prefixes/suffixes intentionally used (here and by testers generally)
// to simulate a "renamed attribute" break — e.g. broken_login_button.
const NOISE_PATTERNS = [/^broken[_-]/i, /[_-]broken$/i, /^invalid[_-]/i, /^old[_-]/i, /^legacy[_-]/i, /^stale[_-]/i];
const ATTR_SYNONYMS = { 'data-test': ['data-testid', 'data-qa', 'data-cy', 'id'], 'data-testid': ['data-test', 'data-qa', 'data-cy', 'id'] };

// Step 0, before any AI call: try Playwright's own querying against a set of
// deterministic candidate selectors derived from the broken one (stripped
// noise prefixes/suffixes, common attribute-name synonyms). This is exactly
// what a human would try first, costs nothing, can't be rate-limited, and
// resolves the common "attribute got renamed" case outright.
async function tryNativeLocatorRepair(page, oldLocator) {
  const attrMatch = oldLocator.match(/\[([\w-]+)=["']([^"']+)["']\]/);
  const candidates = new Set();

  if (attrMatch) {
    const [, attr, value] = attrMatch;
    const cleanedValues = new Set([value]);
    for (const pattern of NOISE_PATTERNS) cleanedValues.add(value.replace(pattern, ''));
    // Also try hyphen/underscore normalization on each variant — a rename
    // that swaps separators (e.g. login-button -> broken_login_button)
    // won't be caught by prefix-stripping alone.
    for (const v of Array.from(cleanedValues)) {
      cleanedValues.add(v.replace(/_/g, '-'));
      cleanedValues.add(v.replace(/-/g, '_'));
    }

    for (const cleanValue of cleanedValues) {
      if (cleanValue && cleanValue !== value) candidates.add(`[${attr}="${cleanValue}"]`);
      for (const altAttr of ATTR_SYNONYMS[attr] || []) {
        candidates.add(altAttr === 'id' ? `#${cleanValue}` : `[${altAttr}="${cleanValue}"]`);
      }
    }
  }

  for (const candidate of candidates) {
    const count = await page.locator(candidate).count().catch(() => 0);
    if (count === 1) return candidate;
  }
  return null;
}

function buildHealingPrompt({ elementDescription, oldLocator, domSnapshot }) {
  return `You are an expert Playwright test engineer performing live root-cause analysis on a broken locator.

Element we're trying to locate: ${elementDescription}
Locator that is currently failing: ${oldLocator}
Live DOM snapshot of the page (HTML, truncated):
${stripForPrompt(domSnapshot)}

The locator above does not match anything in the live DOM. Find the real element in the DOM snapshot that serves the same purpose, and propose a robust CSS selector for it (prefer data-test/data-testid attributes when present).`;
}

async function analyzeWithOpenAI(args) {
  const response = await openai.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: 'You are an expert automated QA engineer specializing in Playwright locator healing. Respond in JSON: {"rootCause": "...", "suggestedLocator": "...", "confidence": <0-100>}' },
      { role: 'user', content: buildHealingPrompt(args) },
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
}

async function analyzeWithClaude(args) {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY not configured — cannot fall back to Claude');
  const response = await anthropic.messages.create({
    model: config.anthropic.model,
    max_tokens: 600,
    tools: [{
      name: 'emit_locator_fix',
      description: 'Emit the root cause and a replacement CSS selector for a broken Playwright locator.',
      input_schema: {
        type: 'object',
        properties: {
          rootCause: { type: 'string' },
          suggestedLocator: { type: 'string' },
          confidence: { type: 'number', description: '0-100' },
        },
        required: ['rootCause', 'suggestedLocator', 'confidence'],
      },
    }],
    tool_choice: { type: 'tool', name: 'emit_locator_fix' },
    messages: [{ role: 'user', content: buildHealingPrompt(args) }],
  });
  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || response.stop_reason === 'max_tokens') throw new Error('Claude response incomplete or truncated');
  return {
    rootCause: block.input.rootCause || 'AI could not determine a root cause.',
    suggestedLocator: block.input.suggestedLocator || null,
    confidence: typeof block.input.confidence === 'number' ? block.input.confidence : 0,
  };
}

// Tiered resolution, cheapest/fastest/most-reliable first:
//   1. Deterministic native Playwright querying (no AI, no quota, instant)
//   2. OpenAI (GPT-4.1) DOM analysis
//   3. Claude (Sonnet) DOM analysis, only if OpenAI errors (e.g. rate limit)
// Every path returns the same shape plus `resolvedBy` for transparency in
// the UI/logs about which tier actually produced the fix.
async function analyzeLocatorFailure({ page, elementDescription, oldLocator, domSnapshot, log }) {
  log('Trying deterministic native locator repair (Playwright querying, no AI)...');
  const nativeMatch = await tryNativeLocatorRepair(page, oldLocator);
  if (nativeMatch) {
    log(`Native repair resolved it without any AI call: ${nativeMatch}`);
    return {
      rootCause: `Resolved deterministically: "${oldLocator}" appears to be a renamed/prefixed variant of an existing attribute. Playwright confirmed exactly one live element matches "${nativeMatch}".`,
      suggestedLocator: nativeMatch,
      confidence: 100,
      resolvedBy: 'native',
    };
  }
  log('No native match found — escalating to AI DOM analysis...');

  const args = { elementDescription, oldLocator, domSnapshot };
  try {
    log('Calling OpenAI (GPT-4.1) for DOM analysis...');
    const result = await analyzeWithOpenAI(args);
    return { ...result, resolvedBy: 'openai' };
  } catch (openaiErr) {
    log(`OpenAI unavailable (${openaiErr.message}) — falling back to Claude...`);
    try {
      const result = await analyzeWithClaude(args);
      return { ...result, resolvedBy: 'claude' };
    } catch (claudeErr) {
      log(`Claude fallback also failed: ${claudeErr.message}`);
      return {
        rootCause: `AI analysis failed on both providers. OpenAI: ${openaiErr.message} | Claude: ${claudeErr.message}`,
        suggestedLocator: null,
        confidence: 0,
        resolvedBy: 'none',
      };
    }
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
  if (runId) activeCycles.set(runId, { locatorKey, logs, step: 'starting', startedAt });
  const log = (message, step) => {
    logs.push({ ts: Date.now(), message });
    console.log(`[Self-Healing] ${message}`);
    const cycle = runId && activeCycles.get(runId);
    if (cycle && step) cycle.step = step;
  };

  log(`Detected broken locator "${locatorKey}"${testFile ? ` (surfaced via ${testFile})` : ''}`);

  const demoConfig = loadLocatorConfig();
  const oldLocator = demoConfig[locatorKey].broken;
  if (runId) activeCycles.get(runId).oldLocator = oldLocator;

  const modulePath = path.join(TESTS_DIR, 'node_modules', '@playwright', 'test');
  const { chromium } = require(modulePath);
  // --no-sandbox/--disable-dev-shm-usage: without these, Chromium's sandbox
  // can fail to initialize in a container (no user namespaces, tiny /dev/shm)
  // and either crash or hang indefinitely with no error — a real cause of
  // runs getting stuck on "Running"/"Healing" in production.
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
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
    log('Reproduced the failure state live against the real application', 'reproducing');

    await page.screenshot({ path: screenshotAbsPath, fullPage: true });
    log(`Captured screenshot -> ${screenshotPath}`);

    const domContent = await page.content();
    fs.writeFileSync(domSnapshotAbsPath, domContent);
    log(`Captured DOM snapshot -> ${domSnapshotPath}`);

    await context.tracing.stop({ path: traceAbsPath });
    log(`Saved Playwright trace -> ${tracePath}`);

    log('Analyzing failure and searching for a replacement locator...', 'analyzing');
    const analysis = await analyzeLocatorFailure({
      page, elementDescription: meta.elementDescription, oldLocator, domSnapshot: domContent, log,
    });
    log(`Root cause (via ${analysis.resolvedBy}): ${analysis.rootCause}`);
    log(`Suggested locator: ${analysis.suggestedLocator} (confidence ${analysis.confidence}%)`);
    if (runId) {
      const cycle = activeCycles.get(runId);
      if (cycle) Object.assign(cycle, { newLocator: analysis.suggestedLocator, confidence: analysis.confidence, rootCause: analysis.rootCause });
    }

    let liveVerified = false;
    if (analysis.suggestedLocator) {
      log('Validating AI-suggested locator against the live DOM...', 'verifying');
      const matchCount = await page.locator(analysis.suggestedLocator).count().catch(() => 0);
      liveVerified = matchCount === 1;
      log(liveVerified ? 'Live validation passed — selector resolves to exactly 1 element' : `Live validation failed — selector matched ${matchCount} element(s)`);
    }

    let retryStatus = 'skipped';
    let healingStatus = 'not_fixable';

    if (liveVerified) {
      demoConfig[locatorKey].healed = analysis.suggestedLocator;
      saveLocatorConfig(demoConfig);
      log('Applied AI-generated locator and retrying the real spec file...', 'retrying');

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
    const resolverTag = { native: '[Native]', openai: '[OpenAI]', claude: '[Claude]', none: '[Failed]' }[analysis.resolvedBy] || '';
    record = {
      id: uuidv4(), runId, locatorKey, testFile, failedTests: failedTestNames,
      oldLocator, newLocator: analysis.suggestedLocator, rootCause: `${resolverTag} ${analysis.rootCause}`.trim(),
      confidenceScore: analysis.confidence, liveVerified, healingStatus, retryStatus,
      screenshotPath, tracePath, domSnapshotPath, timeTakenMs, logs,
      codeSnippet: healingStatus === 'healed' ? buildCodeSnippet(locatorKey, meta.propertyName, analysis.suggestedLocator) : null,
    };
    persistDemoHealingRun(record);
    log(`Healing cycle complete in ${timeTakenMs}ms — status: ${healingStatus.toUpperCase()}`, 'done');
  } finally {
    await browser.close();
    if (runId) activeCycles.delete(runId);
  }

  return record;
}

const MODULE_SPEC_ARG = {
  auth: 'specs/auth/', cart: 'specs/cart/', checkout: 'specs/checkout/',
  inventory: 'specs/inventory/', e2e: 'specs/e2e/',
};

// Generalized counterpart to runRealHealingCycle: handles ANY broken
// selector (extracted straight from the real Playwright error message),
// not just the 2 locators pre-registered in demoLocators.json. This is what
// makes "the AI Agent is not actually healing" no longer true for arbitrary
// breakages — same real browser, real DOM capture, real AI analysis, real
// live verification, real retry as the demo-locator path, but the fix is
// written directly into the Page Object source file that owns the selector
// (the actual "centralized locator repository"), not an in-memory override.
async function runGenericHealingCycle({ module, testFile = null, runId = null, failedTestNames = [], errorMessage }) {
  const oldLocator = extractSelectorFromMessage(errorMessage);
  if (!oldLocator) return null; // nothing DOM-addressable to heal (assertion/timeout/network failure, not a locator)

  const reproduce = MODULE_REPRODUCE[module] || MODULE_REPRODUCE.auth;
  const specArg = MODULE_SPEC_ARG[module] || testFile;

  const startedAt = Date.now();
  const logs = [];
  if (runId) activeCycles.set(runId, { locatorKey: oldLocator, oldLocator, logs, step: 'starting', startedAt });
  const log = (message, step) => {
    logs.push({ ts: Date.now(), message });
    console.log(`[Self-Healing] ${message}`);
    const cycle = runId && activeCycles.get(runId);
    if (cycle && step) cycle.step = step;
  };

  log(`Detected broken locator "${oldLocator}"${testFile ? ` (surfaced via ${testFile})` : ''} — no pre-registered target, running generalized healing`);

  const modulePath = path.join(TESTS_DIR, 'node_modules', '@playwright', 'test');
  const { chromium } = require(modulePath);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();

  const artifactSubdir = `${runId || uuidv4()}-generic-${Date.now()}`;
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
    await reproduce(page);
    log('Reproduced the failure state live against the real application', 'reproducing');

    await page.screenshot({ path: screenshotAbsPath, fullPage: true }).catch(() => {});
    log(`Captured screenshot -> ${screenshotPath}`);

    const domContent = await page.content();
    fs.writeFileSync(domSnapshotAbsPath, domContent);
    log(`Captured DOM snapshot -> ${domSnapshotPath}`);

    await context.tracing.stop({ path: traceAbsPath });
    log(`Saved Playwright trace -> ${tracePath}`);

    log('Analyzing failure and searching for a replacement locator...', 'analyzing');
    const analysis = await analyzeLocatorFailure({
      page, elementDescription: `an element in the "${module}" flow that the test could not find (originally: ${oldLocator})`,
      oldLocator, domSnapshot: domContent, log,
    });
    log(`Root cause (via ${analysis.resolvedBy}): ${analysis.rootCause}`);
    log(`Suggested locator: ${analysis.suggestedLocator} (confidence ${analysis.confidence}%)`);
    if (runId) {
      const cycle = activeCycles.get(runId);
      if (cycle) Object.assign(cycle, { newLocator: analysis.suggestedLocator, confidence: analysis.confidence, rootCause: analysis.rootCause });
    }

    let liveVerified = false;
    if (analysis.suggestedLocator) {
      log('Validating AI-suggested locator against the live DOM...', 'verifying');
      const matchCount = await page.locator(analysis.suggestedLocator).count().catch(() => 0);
      liveVerified = matchCount === 1;
      log(liveVerified ? 'Live validation passed — selector resolves to exactly 1 element' : `Live validation failed — selector matched ${matchCount} element(s)`);
    }

    let retryStatus = 'skipped';
    let healingStatus = 'not_fixable';
    let patched = null;

    if (liveVerified) {
      patched = patchPageObjectSource(oldLocator, analysis.suggestedLocator);
      if (!patched) {
        log(`Found a live-verified replacement, but "${oldLocator}" isn't hard-coded in any Page Object file — cannot persist the fix. Flagging for manual review.`);
      } else {
        log(`Applied AI-generated locator to ${patched.file} (this.${patched.propertyName || '?'}) and retrying the real spec file...`, 'retrying');
        const retry = await retrySpecFile(specArg);
        retryStatus = retry.passed ? 'passed' : 'failed';
        healingStatus = retry.passed ? 'healed' : 'not_fixable';
        log(`Retry result: ${retryStatus.toUpperCase()} (${retry.passedCount}/${retry.totalCount} tests passing)`);

        if (!retry.passed) {
          // The fix didn't actually make the test pass — revert the source
          // change rather than leave a non-working selector in place.
          patchPageObjectSource(analysis.suggestedLocator, oldLocator);
          log('Retry failed — reverted the source file change.');
        }
      }
    } else {
      log('Could not verify a working replacement live. Flagging for manual review with the best AI suggestion attached.');
    }

    const timeTakenMs = Date.now() - startedAt;
    const resolverTag = { native: '[Native]', openai: '[OpenAI]', claude: '[Claude]', none: '[Failed]' }[analysis.resolvedBy] || '';
    const locatorKey = patched ? `${patched.className}.${patched.propertyName || '?'}` : oldLocator;
    record = {
      id: uuidv4(), runId, locatorKey, testFile, failedTests: failedTestNames,
      oldLocator, newLocator: analysis.suggestedLocator, rootCause: `${resolverTag} ${analysis.rootCause}`.trim(),
      confidenceScore: analysis.confidence, liveVerified, healingStatus, retryStatus,
      screenshotPath, tracePath, domSnapshotPath, timeTakenMs, logs,
      codeSnippet: healingStatus === 'healed' && patched ? buildCodeSnippet(locatorKey, patched.propertyName, analysis.suggestedLocator) : null,
    };
    persistDemoHealingRun(record);
    log(`Healing cycle complete in ${timeTakenMs}ms — status: ${healingStatus.toUpperCase()}`, 'done');
  } finally {
    await browser.close();
    if (runId) activeCycles.delete(runId);
  }

  return record;
}

// Clears every locator's `healed` override back to null, re-arming the bait
// locators (still `broken` while DEMO_MODE=true) for another live demo.
function resetDemoLocators() {
  const cfg = loadLocatorConfig();
  for (const key of Object.keys(cfg)) cfg[key].healed = null;
  saveLocatorConfig(cfg);
  return getLocatorsStatus();
}

// Current state of every registered demo locator, in a shape the UI can
// render directly (so a reset has something visible to change on screen).
function getLocatorsStatus() {
  const cfg = loadLocatorConfig();
  return Object.entries(cfg).map(([locatorKey, entry]) => ({
    locatorKey,
    working: entry.working,
    broken: entry.broken,
    healed: entry.healed,
    state: entry.healed ? 'healed' : (config.demoMode ? 'broken' : 'working'),
  }));
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

module.exports = {
  runRealHealingCycle, runGenericHealingCycle, findBrokenLocatorInMessage,
  extractSelectorFromMessage, resetDemoLocators, getDemoHealingRuns,
  getLocatorsStatus, getActiveCycle,
};
