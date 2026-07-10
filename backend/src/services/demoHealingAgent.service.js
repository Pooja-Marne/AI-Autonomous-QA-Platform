const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');
const { getDatabase } = require('../config/database');

const TESTS_DIR = config.automation.repoPath;
// Defensive: a missing/misplaced loadEnv.js or test.env (e.g. a deploy image
// that didn't copy it) must never crash the whole backend on require — the
// BASE_URL fallback below still keeps things working, just less centrally.
try {
  const { loadEnv } = require(path.join(TESTS_DIR, 'loadEnv'));
  loadEnv(path.join(TESTS_DIR, 'test.env'));
} catch (err) {
  console.error(`[Self-Healing] Could not load tests/test.env (${err.message}) — falling back to the hardcoded default BASE_URL.`);
}

const PAGES_DIR = path.join(TESTS_DIR, 'playwright', 'pages');
const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'data', 'demo-artifacts');
// Single source of truth (tests/test.env) shared with playwright.config.js —
// this is what "direct terminal execution" and "AI Agent execution" both
// resolve to now, instead of two independently hardcoded copies of the URL.
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

const openai = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseURL });
const anthropic = config.anthropic.apiKey ? new Anthropic({ apiKey: config.anthropic.apiKey }) : null;

// Real reproduction steps for the AI Healing Demo Site, keyed by test
// module (not by a specific known-broken locator) — this is what lets
// healing generalize to ANY selector failure the module's tests can hit,
// not just one pre-registered target. Every step beyond "auth" logs in
// with the site's real (unresolved) login selectors first, then navigates
// to the module's own page.
const MODULE_REPRODUCE = {
  auth: async (page) => { await page.goto(`${BASE_URL}/login.html`); },
  dashboard: async (page) => {
    await page.goto(`${BASE_URL}/login.html`);
    await page.locator('[data-test="username-input"]').fill('admin');
    await page.locator('[data-test="password-input"]').fill('admin123');
    await page.locator('[data-test="login-button"]').click();
    await page.waitForURL('**/dashboard.html');
  },
  navigation: async (page) => {
    await MODULE_REPRODUCE.dashboard(page);
  },
  products: async (page) => {
    await MODULE_REPRODUCE.dashboard(page);
    await page.goto(`${BASE_URL}/products.html`);
  },
  users: async (page) => {
    await MODULE_REPRODUCE.dashboard(page);
    await page.goto(`${BASE_URL}/users.html`);
  },
  orders: async (page) => {
    await MODULE_REPRODUCE.dashboard(page);
    await page.goto(`${BASE_URL}/orders.html`);
  },
};

const MODULE_SPEC_ARG = {
  auth: 'specs/auth.spec.js',
  dashboard: 'specs/dashboard.spec.js',
  navigation: 'specs/navigation.spec.js',
  orders: 'specs/orders.spec.js',
  products: 'specs/products.spec.js',
  users: 'specs/users.spec.js',
};

// Extracts the raw selector Playwright reported as unresolvable from a
// failure's error message — works for ANY broken locator. Playwright
// renders this consistently as locator('...') in both the short error and
// the "waiting for" log line.
function extractSelectorFromMessage(message) {
  if (!message) return null;
  const match = message.match(/locator\(\s*['"](.+?)['"]\s*\)/);
  return match ? match[1] : null;
}

// Finds which Page Object class/property currently defaults to a selector
// string. Every Page Object wraps its locators in
// resolve('ClassName.property', 'default-selector') (see
// tests/playwright/locators/resolve.js), so identifying the owner is a
// simple, reliable text match on that call shape — no per-locator
// registration needed for this to work generically.
function findPageObjectPropertyForSelector(oldSelector) {
  const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.js'));
  const escaped = oldSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const file of files) {
    const content = fs.readFileSync(path.join(PAGES_DIR, file), 'utf-8');
    const match = content.match(new RegExp(`resolve\\(\\s*['"\`](\\w+)\\.(\\w+)['"\`]\\s*,\\s*['"\`]${escaped}['"\`]\\s*\\)`));
    if (match) return { file, className: match[1], propertyName: match[2] };
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

// The one real (not simulated) self-healing cycle, for ANY broken selector
// extracted straight from a real Playwright error message — no pre-
// registered target needed. Capture real artifacts from the live app, ask
// the AI to analyze the real DOM, verify its suggestion against the live
// page, then retry the real spec file. The fix is recorded in the
// Centralized Locator Repository (SQLite, versioned, visible on the
// dashboard) and synced to the runtime cache every Page Object reads — NOT
// written directly into source, so it can never diverge silently from
// what's in git. A human approves it via the dashboard before it becomes a
// real commit/PR (see gitIntegration.service.js).
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

  log(`Detected broken locator "${oldLocator}"${testFile ? ` (surfaced via ${testFile})` : ''} — running self-healing`);

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
    let owner = null;
    let repositoryEntry = null;
    const { recordHealedLocator, rejectLocator } = require('./locatorRepository.service');

    if (liveVerified) {
      owner = findPageObjectPropertyForSelector(oldLocator);
      if (!owner) {
        log(`Found a live-verified replacement, but "${oldLocator}" isn't a registered default in any Page Object — cannot persist the fix. Flagging for manual review.`);
      } else {
        // Record BEFORE retrying — this writes the fix into the Centralized
        // Locator Repository's runtime cache (resolved-locators.json), which
        // is what the retry's fresh Page Object construction actually reads.
        // Source code (the .js file) is untouched here — that only happens
        // if/when a human approves this via the dashboard (Git integration).
        repositoryEntry = recordHealedLocator({
          pageObject: owner.className, propertyName: owner.propertyName,
          originalLocator: oldLocator, healedLocator: analysis.suggestedLocator,
          confidenceScore: analysis.confidence, healingReason: analysis.rootCause,
          testFile, module, runId, liveVerified: true,
        });
        log(`Stored in Locator Repository as ${owner.className}.${owner.propertyName} (v${repositoryEntry.version}, pending approval) and retrying the real spec file...`, 'retrying');

        const retry = await retrySpecFile(specArg);
        retryStatus = retry.passed ? 'passed' : 'failed';
        healingStatus = retry.passed ? 'healed' : 'not_fixable';
        log(`Retry result: ${retryStatus.toUpperCase()} (${retry.passedCount}/${retry.totalCount} tests passing)`);

        if (!retry.passed) {
          // The fix didn't actually validate against the real retry — pull
          // it out of rotation immediately so no subsequent run keeps
          // resolving to a locator that doesn't actually work.
          rejectLocator(repositoryEntry.id);
          log('Retry failed — rejected the repository entry; runtime resolution reverts to the Page Object default.');
        }
      }
    } else {
      log('Could not verify a working replacement live. Flagging for manual review with the best AI suggestion attached.');
    }

    const timeTakenMs = Date.now() - startedAt;
    const resolverTag = { native: '[Native]', openai: '[OpenAI]', claude: '[Claude]', none: '[Failed]' }[analysis.resolvedBy] || '';
    const locatorKey = owner ? `${owner.className}.${owner.propertyName}` : oldLocator;
    record = {
      id: uuidv4(), runId, locatorKey, testFile, failedTests: failedTestNames,
      oldLocator, newLocator: analysis.suggestedLocator, rootCause: `${resolverTag} ${analysis.rootCause}`.trim(),
      confidenceScore: analysis.confidence, liveVerified, healingStatus, retryStatus,
      screenshotPath, tracePath, domSnapshotPath, timeTakenMs, logs,
      codeSnippet: healingStatus === 'healed' && owner ? buildCodeSnippet(locatorKey, owner.propertyName, analysis.suggestedLocator) : null,
    };
    persistDemoHealingRun(record);
    log(`Healing cycle complete in ${timeTakenMs}ms — status: ${healingStatus.toUpperCase()}`, 'done');
  } finally {
    await browser.close();
    if (runId) activeCycles.delete(runId);
  }

  return record;
}

function getDemoHealingRuns({ limit = 50 } = {}) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM demo_healing_runs ORDER BY created_at DESC LIMIT ?').all(limit).map((r) => ({
    ...r,
    failedTests: JSON.parse(r.failed_tests || '[]'),
    logs: JSON.parse(r.logs || '[]'),
    liveVerified: Boolean(r.live_verified),
    code_snippet: r.healing_status === 'healed'
      ? buildCodeSnippet(r.locator_key, r.locator_key?.split('.')[1], r.new_locator)
      : null,
  }));
}

module.exports = {
  runGenericHealingCycle, extractSelectorFromMessage,
  getDemoHealingRuns, getActiveCycle,
};
