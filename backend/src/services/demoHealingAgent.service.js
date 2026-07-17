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

const ARTIFACTS_DIR = path.join(__dirname, '..', '..', 'data', 'demo-artifacts');
const CAPTURE_DIR = path.join(TESTS_DIR, 'test-results', 'failure-context');
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const MAX_HEALING_ATTEMPTS = 3;
// Guards against an unbounded chain if a test is blocked by many sequential
// broken locators — three genuinely distinct broken locators in one test is
// already an unusual amount of chaos; beyond that, stop and surface what
// was fixed so far rather than looping indefinitely.
const MAX_LOCATORS_PER_CYCLE = 3;

const openai = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseURL });
const anthropic = config.anthropic.apiKey ? new Anthropic({ apiKey: config.anthropic.apiKey }) : null;

// Extracts the raw selector Playwright reported as unresolvable from a
// failure's error message — works for ANY broken locator. Playwright
// renders this consistently as locator('...') in both the short error and
// the "waiting for" log line. This is text parsing of Playwright's own
// generated message, not a predefined mapping.
function extractSelectorFromMessage(message) {
  if (!message) return null;
  const match = message.match(/locator\(\s*['"](.+?)['"]\s*\)/);
  return match ? match[1] : null;
}

// Finds which Page Object class/property currently defaults to a selector
// string — delegates to the shared source-reading module (also used by
// gitIntegration.service.js and the pre-healing resolution check below) so
// the `resolve('ClassName.property', 'value')` regex lives in exactly one place.
const { findOwnerBySelectorValue } = require('./pageObjectSource.service');

// Fallback for when the broken value never matches any Page Object's
// hardcoded default — e.g. the break came from a runtime DOM mutation
// (Chaos Mode, or any live attribute rename) rather than an edit to
// source, so the code's default is still the CORRECT value and can never
// string-match the broken one. Reads the actual stack trace's file+line —
// which points at exactly where `this.<property>` was accessed — and
// extracts the property name directly from source at that line, plus the
// class name from the file. Fully generic: works for any page/property.
function findPageObjectPropertyFromStackTrace(stackTrace) {
  if (!stackTrace) return null;
  const pagesDirMarker = path.join('playwright', 'pages') + path.sep;
  const altMarker = 'playwright/pages/';
  for (const rawLine of stackTrace.split('\n')) {
    const frameMatch = rawLine.match(/\(?([^\s()]+\.js):(\d+):\d+\)?/);
    if (!frameMatch) continue;
    const [, filePath, lineNumStr] = frameMatch;
    if (!filePath.includes(pagesDirMarker) && !filePath.includes(altMarker)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const line = lines[parseInt(lineNumStr, 10) - 1] || '';
      const propMatch = line.match(/this\.(\w+)/);
      const classMatch = content.match(/class\s+(\w+)/);
      if (propMatch && classMatch) {
        return { file: path.basename(filePath), className: classMatch[1], propertyName: propMatch[1] };
      }
    } catch {
      // try the next stack frame
    }
  }
  return null;
}

// Reads the real DOM/URL captured automatically at the exact moment a test
// failed (see tests/playwright/fixtures/healingTest.js) — this is what lets
// the agent analyze the REAL failure state instead of relying on hardcoded
// per-page/per-module navigation scripts to approximately reproduce it. If
// no capture exists (e.g. the spec doesn't use the fixture), the caller
// falls back to opening BASE_URL directly.
function readFailureCapture(testName) {
  if (!testName) return null;
  const key = testName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 150);
  try {
    return JSON.parse(fs.readFileSync(path.join(CAPTURE_DIR, `${key}.json`), 'utf-8'));
  } catch {
    return null;
  }
}

// In-progress healing cycles, keyed by runId — lets the UI poll live
// progress (which locator, what step, failure type, running log) instead of
// only seeing a result once persistDemoHealingRun() writes the final row.
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
    .slice(0, 10000);
}

// Generic, app-agnostic extraction of every interactive/identifiable
// element currently on the live page — no per-app knowledge, no predefined
// synonym table. This is what the LLM reasons over to find a replacement,
// instead of a hardcoded attribute-renaming heuristic.
async function gatherCandidateElements(page) {
  return page.evaluate(() => {
    const SELECTOR = 'input, button, a, select, textarea, [role], [aria-label], [data-test], [data-testid], [onclick]';
    return Array.from(document.querySelectorAll(SELECTOR))
      .filter((el) => el.offsetWidth || el.offsetHeight || el.getClientRects().length)
      .slice(0, 150)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        dataTest: el.getAttribute('data-test'),
        dataTestId: el.getAttribute('data-testid'),
        id: el.id || null,
        ariaLabel: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        placeholder: el.getAttribute('placeholder'),
        type: el.getAttribute('type'),
        text: (el.textContent || '').trim().slice(0, 60),
      }));
  }).catch(() => []);
}

// Step 1 of the AI's reasoning, shown distinctly on the dashboard: what KIND
// of failure is this, using the Senior-QA-Engineer taxonomy — before any
// locator-repair work is attempted. Only failures classified as DOM/locator-
// addressable proceed to the healing pipeline below; everything else (a
// timing race, a real API outage, an assertion that's actually correct now)
// gets an honest diagnosis instead of a locator fix that would never apply.
function buildClassificationPrompt({ errorMessage, stackTrace, testName }) {
  return `You are a Senior QA Automation Engineer triaging a failed Playwright test.

Test: ${testName || 'unknown'}
Error message: ${errorMessage || 'N/A'}
Stack trace (truncated): ${(stackTrace || '').slice(0, 1000)}

Classify this failure into EXACTLY ONE of these categories:
- broken_locator: the element genuinely no longer exists under the old selector, but functionally-equivalent markup likely exists elsewhere in the DOM
- page_changed: the page structure/flow changed materially (different page loaded, redirected elsewhere than expected)
- element_hidden: the element exists but is not visible/interactable (covered, display:none, wrong viewport, etc.)
- dynamic_dom: the element loads asynchronously and was not yet rendered at the time of interaction
- timing_issue: a race condition or insufficient wait, unrelated to whether the element exists
- network_issue: a network request failed, was slow, or the app was unreachable
- api_failure: a backend/API call the page depends on returned an error or unexpected data
- authentication_issue: the user session/login state is invalid or expired
- assertion_failure: the test's expectation is wrong given the app's current (correct) behavior — not a locator problem at all

Respond in JSON:
{
  "failureType": "<one of the categories above>",
  "confidence": <0-100>,
  "reasoning": "<why you believe this, referencing the actual error text>",
  "locatorAddressable": <true|false — true only for broken_locator, page_changed, element_hidden, or dynamic_dom>
}`;
}

async function classifyFailureType({ errorMessage, stackTrace, testName, log }) {
  log('Classifying failure type...', 'classifying');
  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: 'You are a Senior QA Automation Engineer. Respond only with the requested JSON.' },
        { role: 'user', content: buildClassificationPrompt({ errorMessage, stackTrace, testName }) },
      ],
      temperature: 0.1,
      max_tokens: 400,
      response_format: { type: 'json_object' },
    });
    const result = JSON.parse(response.choices[0].message.content);
    log(`Failure type: ${result.failureType} (confidence ${result.confidence}%) — ${result.reasoning}`);
    return {
      failureType: result.failureType || 'broken_locator',
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      reasoning: result.reasoning || '',
      locatorAddressable: result.locatorAddressable !== false,
    };
  } catch (err) {
    // Degraded-mode fallback ONLY for LLM outage — never a deterministic
    // healing decision, just "assume it might be a locator so we don't
    // silently drop a real fixable failure while the model is unavailable".
    log(`Classification call failed (${err.message}) — assuming broken_locator so healing can still be attempted.`);
    return { failureType: 'broken_locator', confidence: 0, reasoning: `Classifier unavailable: ${err.message}`, locatorAddressable: true };
  }
}

function buildLocatorPrompt({ elementDescription, oldLocator, domSnapshot, candidates, attempt, previousAttempts }) {
  const candidateBlock = (candidates || []).slice(0, 80).map((c, i) =>
    `${i + 1}. <${c.tag}> data-test=${c.dataTest || '—'} data-testid=${c.dataTestId || '—'} id=${c.id || '—'} aria-label=${c.ariaLabel || '—'} role=${c.role || '—'} placeholder=${c.placeholder || '—'} text="${c.text}"`
  ).join('\n');

  const historyBlock = previousAttempts.length
    ? `\n\nPrevious attempts that did NOT resolve to exactly one live element — do not repeat these:\n${previousAttempts.map((a) => `- "${a.locator}" -> ${a.reason}`).join('\n')}`
    : '';

  return `You are a Senior QA Automation Engineer performing live root-cause analysis on a broken Playwright locator. This is attempt ${attempt} of ${MAX_HEALING_ATTEMPTS}.

Element we're trying to locate: ${elementDescription}
Locator that is currently failing: ${oldLocator}

Candidate interactive elements currently visible on the live page:
${candidateBlock || '(none found)'}
${historyBlock}

Live DOM snapshot (HTML, truncated):
${stripForPrompt(domSnapshot)}

Reason about which candidate (or any other element in the DOM/screenshot) now represents the same functionality the original locator was targeting. Consider data-test, id, aria-label, role, placeholder, visible text, CSS/DOM position, and the screenshot's visual layout if provided. Propose the single most reliable CSS selector (prefer data-test/data-testid/id when present; fall back to role/aria-label/text-based selectors otherwise).

Respond in JSON: {"rootCause": "...", "suggestedLocator": "...", "confidence": <0-100>}`;
}

async function analyzeWithOpenAI(args) {
  const content = [{ type: 'text', text: buildLocatorPrompt(args) }];
  if (args.screenshotBase64) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${args.screenshotBase64}` } });
  }
  const response = await openai.chat.completions.create({
    model: config.openai.model,
    messages: [
      { role: 'system', content: 'You are an expert automated QA engineer specializing in Playwright locator healing. Respond in JSON: {"rootCause": "...", "suggestedLocator": "...", "confidence": <0-100>}' },
      { role: 'user', content },
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
  const content = [{ type: 'text', text: buildLocatorPrompt(args) }];
  if (args.screenshotBase64) {
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: args.screenshotBase64 } });
  }
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
    messages: [{ role: 'user', content }],
  });
  const block = response.content.find((b) => b.type === 'tool_use');
  if (!block || response.stop_reason === 'max_tokens') throw new Error('Claude response incomplete or truncated');
  return {
    rootCause: block.input.rootCause || 'AI could not determine a root cause.',
    suggestedLocator: block.input.suggestedLocator || null,
    confidence: typeof block.input.confidence === 'number' ? block.input.confidence : 0,
  };
}

// Iterative, fully LLM-driven resolution — no deterministic shortcut ever
// bypasses the model's judgment (no attribute-synonym table, no prefix-
// stripping heuristic). If a suggestion doesn't validate against the live
// DOM, the failure is fed back to the model and it tries again, up to
// MAX_HEALING_ATTEMPTS, before the locator is given up on.
async function analyzeLocatorFailure({ page, elementDescription, oldLocator, domSnapshot, candidates, screenshotBase64, log }) {
  const previousAttempts = [];

  for (let attempt = 1; attempt <= MAX_HEALING_ATTEMPTS; attempt++) {
    log(`Asking the LLM for a candidate locator (attempt ${attempt}/${MAX_HEALING_ATTEMPTS})...`, 'analyzing');
    const args = { elementDescription, oldLocator, domSnapshot, candidates, screenshotBase64, attempt, previousAttempts };

    let result;
    try {
      result = { ...(await analyzeWithOpenAI(args)), resolvedBy: 'openai' };
    } catch (openaiErr) {
      log(`OpenAI unavailable (${openaiErr.message}) — falling back to Claude...`);
      try {
        result = { ...(await analyzeWithClaude(args)), resolvedBy: 'claude' };
      } catch (claudeErr) {
        log(`Claude fallback also failed: ${claudeErr.message}`);
        return {
          rootCause: `AI analysis failed on both providers. OpenAI: ${openaiErr.message} | Claude: ${claudeErr.message}`,
          suggestedLocator: null, confidence: 0, resolvedBy: 'none', liveVerified: false, attempts: attempt,
        };
      }
    }

    log(`Attempt ${attempt}: suggested "${result.suggestedLocator}" (confidence ${result.confidence}%) via ${result.resolvedBy} — ${result.rootCause}`);

    if (!result.suggestedLocator) {
      previousAttempts.push({ locator: '(none returned)', reason: 'model did not propose a selector' });
      continue;
    }

    const matchCount = await page.locator(result.suggestedLocator).count().catch(() => 0);
    if (matchCount === 1) {
      log(`Live validation passed on attempt ${attempt} — selector resolves to exactly 1 element`, 'verifying');
      return { ...result, liveVerified: true, attempts: attempt };
    }

    const reason = matchCount === 0 ? 'matched 0 live elements' : `matched ${matchCount} live elements (not unique)`;
    log(`Attempt ${attempt} failed live validation — ${reason}`, 'verifying');
    previousAttempts.push({ locator: result.suggestedLocator, reason });
  }

  log(`Exhausted ${MAX_HEALING_ATTEMPTS} attempts without a live-verified locator.`);
  return {
    rootCause: `Tried ${MAX_HEALING_ATTEMPTS} candidate locators across ${previousAttempts.length} attempts; none resolved to exactly one live element.`,
    suggestedLocator: null, confidence: 0, resolvedBy: 'none', liveVerified: false, attempts: MAX_HEALING_ATTEMPTS,
  };
}

// Generic, app-agnostic reproduction: prefer the exact URL captured at the
// moment the original test failed (see readFailureCapture above); if none
// exists, fall back to opening the live application at BASE_URL directly.
// The context this page belongs to must already have the captured
// storageState applied (see runHealingCycle) — restoring session/cookies is
// what lets this actually land on an authenticated page instead of being
// bounced to a login screen by the app's own client-side auth guard.
async function reproduceForHealing(page, capture) {
  // domcontentloaded, not the default 'load': we only need the DOM to
  // inspect it, not every image/font/stylesheet to finish fetching.
  if (capture?.url) {
    await page.goto(capture.url, { waitUntil: 'domcontentloaded' });
    return true;
  }
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  return false;
}

// `spawn(..., { shell: true })` on POSIX joins the args array into one
// string with plain spaces before handing it to `/bin/sh -c` — it does NOT
// shell-quote each element. A test title contains spaces, so without this,
// the shell word-splits it and Playwright's --grep only ever receives the
// first word, silently matching every test that happens to start the same
// way (e.g. both "@create-order ..." tests) instead of just the one being
// retried. Windows' cmd.exe needs double quotes instead of single quotes.
function shellQuoteArg(str) {
  if (process.platform === 'win32') return `"${str.replace(/"/g, '""')}"`;
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

// Pulls the first real failure's message + stack out of a Playwright JSON
// result. The message is used both for diagnostics AND to detect whether a
// retry's remaining failure points at the SAME locator (the fix was wrong)
// or a DIFFERENT one (the fix was right, but the test hit a second,
// independent broken locator further along the same flow) — see the
// advancedPastThisLocator check in runHealingCycle.
function extractFirstFailureDetails(results) {
  let detail = null;
  function walk(suites) {
    for (const suite of suites || []) {
      if (detail) return;
      if (suite.suites) walk(suite.suites);
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const result = test.results?.[test.results.length - 1];
          if (result?.status !== 'passed' && result?.error) {
            detail = {
              message: (result.error.message || '').replace(/\x1B\[[0-9;]*m/g, '').slice(0, 300),
              stack: (result.error.stack || '').replace(/\x1B\[[0-9;]*m/g, ''),
            };
            return;
          }
        }
      }
    }
  }
  walk(results?.suites);
  return detail;
}

function retryTest(testFile, testName, { timeoutMs } = {}) {
  return new Promise((resolve) => {
    const args = ['playwright', 'test'];
    if (testFile) args.push(testFile);
    if (testName) args.push('--grep', shellQuoteArg(testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    args.push('--project=chromium', '--reporter=json');
    if (timeoutMs) args.push(`--timeout=${timeoutMs}`);
    // The node-level subprocess timeout is a hard kill for the WHOLE `npx
    // playwright test` invocation (npx resolution + test-runner boot + the
    // actual test), so it must stay comfortably above whatever per-test
    // timeout we just asked Playwright to use — otherwise a legitimately
    // still-running, correctly-bumped test gets killed by this outer guard
    // before Playwright's own timeout ever gets a chance to apply.
    const spawnTimeout = timeoutMs ? Math.max(90000, timeoutMs + 30000) : 90000;
    const proc = spawn('npx', args, { cwd: TESTS_DIR, shell: true, timeout: spawnTimeout });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      try {
        const jsonStart = stdout.indexOf('{');
        const results = JSON.parse(stdout.substring(jsonStart));
        const total = results.stats?.expected + results.stats?.unexpected + results.stats?.flaky || 0;
        const failed = results.stats?.unexpected || 0;
        const failureDetail = failed > 0 ? extractFirstFailureDetails(results) : null;
        resolve({
          passed: failed === 0 && total > 0, totalCount: total, passedCount: total - failed,
          failureMessage: failureDetail?.message || null,
          failureStack: failureDetail?.stack || null,
        });
      } catch (parseErr) {
        resolve({
          passed: false, totalCount: 0, passedCount: 0,
          failureMessage: `Could not parse retry output (exit ${code}): ${parseErr.message}. stderr: ${stderr.slice(0, 300)}`,
          failureStack: null,
        });
      }
    });
    proc.on('error', (err) => resolve({ passed: false, totalCount: 0, passedCount: 0, failureMessage: `spawn error: ${err.message}`, failureStack: null }));
  });
}

function persistDemoHealingRun(r) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO demo_healing_runs (
      id, run_id, locator_key, test_file, failed_tests, old_locator, new_locator,
      root_cause, confidence_score, live_verified, healing_status, retry_status,
      screenshot_path, trace_path, dom_snapshot_path, time_taken_ms, logs, failure_type, attempts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(...[
    r.id, r.runId, r.locatorKey, r.testFile, JSON.stringify(r.failedTests || []),
    r.oldLocator, r.newLocator, r.rootCause, r.confidenceScore, r.liveVerified ? 1 : 0,
    r.healingStatus, r.retryStatus, r.screenshotPath, r.tracePath, r.domSnapshotPath,
    r.timeTakenMs, JSON.stringify(r.logs || []), r.failureType || null, r.attempts || null,
  ].map((v) => (v === undefined ? null : v))); // node:sqlite rejects `undefined` bind values outright
}

function buildCodeSnippet(locatorKey, propertyName, locator) {
  if (!locator) return null;
  const [pageObject] = locatorKey.split('.');
  return `// ${pageObject}.js\nthis.${propertyName} = page.locator('${locator}');`;
}

// The single, fully LLM-driven self-healing cycle for ANY failed test.
// Every decision — what kind of failure this is, which element now
// represents the same functionality, whether the fix is good enough to
// keep — is made by the model reasoning over the LIVE application, never a
// hardcoded per-page script or attribute-synonym table. The fix is recorded
// in the Centralized Locator Repository (SQLite, versioned, visible on the
// dashboard) and synced to the runtime cache every Page Object reads — NOT
// written directly into source, so it can never diverge silently from
// what's in git. A human approves it via the dashboard before it becomes a
// real commit/PR (see gitIntegration.service.js).
async function runHealingCycle({ module, testFile = null, testName = null, runId = null, failedTestNames = [], errorMessage, stackTrace = null }) {
  const oldLocator = extractSelectorFromMessage(errorMessage);

  const startedAt = Date.now();
  const logs = [];
  if (runId) activeCycles.set(runId, { locatorKey: oldLocator || testName, oldLocator, logs, step: 'starting', startedAt });
  const log = (message, step) => {
    logs.push({ ts: Date.now(), message });
    console.log(`[Self-Healing] ${message}`);
    const cycle = runId && activeCycles.get(runId);
    if (cycle && step) cycle.step = step;
  };

  log(`Detected failure in "${testName || testFile || 'unknown test'}" — starting AI triage`);

  const classification = await classifyFailureType({ errorMessage, stackTrace, testName, log });
  if (runId) {
    const cycle = activeCycles.get(runId);
    if (cycle) cycle.failureType = classification.failureType;
  }

  const timeTakenMs = () => Date.now() - startedAt;

  if (!oldLocator || !classification.locatorAddressable) {
    log(`Classified as "${classification.failureType}" — not a locator-repair candidate. Recording diagnosis for manual review.`, 'done');
    const record = {
      id: uuidv4(), runId, locatorKey: oldLocator || testName, testFile, failedTests: failedTestNames,
      oldLocator: oldLocator || null, newLocator: null,
      rootCause: `[${classification.failureType}] ${classification.reasoning}`,
      confidenceScore: classification.confidence, liveVerified: false, healingStatus: 'not_fixable', retryStatus: 'skipped',
      screenshotPath: null, tracePath: null, domSnapshotPath: null, timeTakenMs: timeTakenMs(), logs,
      failureType: classification.failureType, attempts: 0,
    };
    persistDemoHealingRun(record);
    if (runId) activeCycles.delete(runId);
    return record;
  }

  // Before spending a browser session + LLM call: has this exact locator
  // already been healed, approved, and merged into the current checked-out
  // source? If so, the failure is stale (the environment under test just
  // hasn't picked up the fix yet) — mark the repository entry resolved and
  // skip re-healing rather than opening a duplicate healing cycle for a fix
  // that already exists in source.
  const preHealOwner = findOwnerBySelectorValue(oldLocator) || findPageObjectPropertyFromStackTrace(stackTrace);
  if (preHealOwner) {
    const { findActiveLocatorRepositoryRow, resolveIfSourceMatches } = require('./locatorRepository.service');
    const activeRow = findActiveLocatorRepositoryRow(preHealOwner.className, preHealOwner.propertyName);
    if (activeRow && resolveIfSourceMatches(activeRow, 'pre_healing_source_check')) {
      log(`Source already contains the healed locator for ${preHealOwner.className}.${preHealOwner.propertyName} — marking resolved and skipping healing.`, 'done');
      const record = {
        id: uuidv4(), runId, locatorKey: `${preHealOwner.className}.${preHealOwner.propertyName}`, testFile, failedTests: failedTestNames,
        oldLocator, newLocator: activeRow.healed_locator,
        rootCause: 'Fix already present in current source (PR merged/deployed) — healing skipped.',
        confidenceScore: activeRow.confidence_score, liveVerified: true,
        healingStatus: 'already_resolved', retryStatus: 'skipped',
        screenshotPath: null, tracePath: null, domSnapshotPath: null,
        timeTakenMs: timeTakenMs(), logs, failureType: classification.failureType, attempts: 0,
      };
      persistDemoHealingRun(record);
      if (runId) activeCycles.delete(runId);
      return record;
    }
  }

  const modulePath = path.join(TESTS_DIR, 'node_modules', '@playwright', 'test');
  const { chromium } = require(modulePath);
  // --no-sandbox/--disable-dev-shm-usage: without these, Chromium's sandbox
  // can fail to initialize in a container (no user namespaces, tiny /dev/shm)
  // and either crash or hang indefinitely with no error — a real cause of
  // runs getting stuck on "Running"/"Healing" in production.
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const { recordHealedLocator, rejectLocator } = require('./locatorRepository.service');

  // A single failing test can be blocked by MORE THAN ONE broken locator in
  // sequence (e.g. username AND password both broken). Fixing the first one
  // correctly just means the retry advances further and fails on the next
  // one — a DIFFERENT locator, not the one we just fixed. Looping here
  // (instead of one-shot analyze+retry) is what lets the agent recognize
  // that as proof the first fix was correct, keep it, and go on to heal the
  // newly-exposed locator too — instead of wrongly rejecting a provably
  // working fix just because the overall test still failed for an
  // unrelated, later reason.
  let currentOldLocator = oldLocator;
  let currentStackTrace = stackTrace;
  let currentCapture = readFailureCapture(testName);
  const records = [];

  try {
    for (let locatorIndex = 1; locatorIndex <= MAX_LOCATORS_PER_CYCLE; locatorIndex++) {
      const logsStartIndex = logs.length;
      // Restoring the captured storageState (localStorage/cookies) is what
      // lets this land on an authenticated page instead of being bounced to
      // login by the app's own client-side auth guard — generic, no
      // per-app auth logic.
      const context = await browser.newContext(currentCapture?.storageState ? { storageState: currentCapture.storageState } : {});
      // snapshots:false — we already capture our own screenshot/DOM
      // directly; per-action DOM snapshotting for the trace viewer roughly
      // doubles tracing overhead and isn't used anywhere in the dashboard.
      await context.tracing.start({ screenshots: true, snapshots: false });
      const page = await context.newPage();

      const artifactSubdir = `${runId || uuidv4()}-heal-${Date.now()}-${locatorIndex}`;
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
        const usedCapture = await reproduceForHealing(page, currentCapture);
        log(usedCapture
          ? 'Navigated to the exact URL captured at the moment of the original failure'
          : `No failure capture found for this test — opened the live application at ${BASE_URL} directly`, 'reproducing');

        await page.screenshot({ path: screenshotAbsPath, fullPage: true }).catch(() => {});
        log(`Captured screenshot -> ${screenshotPath}`);
        let screenshotBase64 = null;
        try { screenshotBase64 = fs.readFileSync(screenshotAbsPath).toString('base64'); } catch { /* screenshot best-effort */ }

        const domContent = await page.content();
        fs.writeFileSync(domSnapshotAbsPath, domContent);
        log(`Captured DOM snapshot -> ${domSnapshotPath}`);

        await context.tracing.stop({ path: traceAbsPath });
        log(`Saved Playwright trace -> ${tracePath}`);

        log('Inspecting the live DOM for candidate interactive elements (data-test, id, aria-label, role, placeholder, text)...', 'analyzing');
        const candidates = await gatherCandidateElements(page);
        log(`Found ${candidates.length} candidate elements on the live page.`);

        const analysis = await analyzeLocatorFailure({
          page,
          elementDescription: `an element the test "${testName || 'unknown'}" could not find (originally targeted by: ${currentOldLocator})`,
          oldLocator: currentOldLocator, domSnapshot: domContent, candidates, screenshotBase64, log,
        });

        if (runId) {
          const cycle = activeCycles.get(runId);
          if (cycle) Object.assign(cycle, { newLocator: analysis.suggestedLocator, confidence: analysis.confidence, rootCause: analysis.rootCause });
        }

        // Internally we still track exactly which tier resolved it
        // (analysis.resolvedBy, stored separately) — the displayed root
        // cause just says "AI Analysis" rather than naming a provider.
        const resolverTag = { native: '[Deterministic]', openai: '[AI Analysis]', claude: '[AI Analysis]', none: '[Unresolved]' }[analysis.resolvedBy] || '';

        if (!analysis.liveVerified) {
          log('Could not find a working replacement after all attempts. Flagging for manual review with the full attempt history attached.', 'done');
          record = {
            id: uuidv4(), runId, locatorKey: currentOldLocator, testFile, failedTests: failedTestNames,
            oldLocator: currentOldLocator, newLocator: null, rootCause: `${resolverTag} ${analysis.rootCause}`.trim(),
            confidenceScore: analysis.confidence, liveVerified: false, healingStatus: 'not_fixable', retryStatus: 'skipped',
            screenshotPath, tracePath, domSnapshotPath, timeTakenMs: timeTakenMs(), logs: logs.slice(logsStartIndex),
            failureType: classification.failureType, attempts: analysis.attempts || 0,
          };
          records.push(record);
          break;
        }

        // Try matching the broken value against a Page Object default first
        // (works when source was edited to something wrong); fall back to
        // reading the stack trace's actual file+line (works when the break
        // came from a runtime DOM mutation instead, e.g. Chaos Mode) — the
        // code's default is still correct in that case, so it never
        // string-matches, but the stack trace still tells us exactly which
        // property was being accessed.
        const owner = findOwnerBySelectorValue(currentOldLocator) || findPageObjectPropertyFromStackTrace(currentStackTrace);
        if (!owner) {
          log(`Found a live-verified replacement, but "${currentOldLocator}" isn't a registered default in any Page Object — cannot persist the fix. Flagging for manual review.`, 'done');
          record = {
            id: uuidv4(), runId, locatorKey: currentOldLocator, testFile, failedTests: failedTestNames,
            oldLocator: currentOldLocator, newLocator: analysis.suggestedLocator, rootCause: `${resolverTag} ${analysis.rootCause}`.trim(),
            confidenceScore: analysis.confidence, liveVerified: true, healingStatus: 'not_fixable', retryStatus: 'skipped',
            screenshotPath, tracePath, domSnapshotPath, timeTakenMs: timeTakenMs(), logs: logs.slice(logsStartIndex),
            failureType: classification.failureType, attempts: analysis.attempts || 0,
          };
          records.push(record);
          break;
        }

        // Record BEFORE retrying — this writes the fix into the Centralized
        // Locator Repository's runtime cache (resolved-locators.json), which
        // is what the retry's fresh Page Object construction actually reads.
        // Source code (the .js file) is untouched here — that only happens
        // if/when a human approves this via the dashboard (Git integration).
        const repositoryEntry = recordHealedLocator({
          pageObject: owner.className, propertyName: owner.propertyName,
          originalLocator: currentOldLocator, healedLocator: analysis.suggestedLocator,
          confidenceScore: analysis.confidence, healingReason: analysis.rootCause,
          testFile, module, runId, liveVerified: true,
        });
        log(`Stored in Locator Repository as ${owner.className}.${owner.propertyName} (v${repositoryEntry.version}, pending approval) and retrying the exact failing test...`, 'retrying');

        const retry = await retryTest(testFile, testName);
        log(`Retry result: ${retry.passed ? 'PASSED' : 'FAILED'} (${retry.passedCount}/${retry.totalCount} tests passing)`);
        if (!retry.passed && retry.failureMessage) log(`Retry failure detail: ${retry.failureMessage}`);

        const locatorKey = `${owner.className}.${owner.propertyName}`;

        if (retry.passed) {
          record = {
            id: uuidv4(), runId, locatorKey, testFile, failedTests: failedTestNames,
            oldLocator: currentOldLocator, newLocator: analysis.suggestedLocator, rootCause: `${resolverTag} ${analysis.rootCause}`.trim(),
            confidenceScore: analysis.confidence, liveVerified: true, healingStatus: 'healed', retryStatus: 'passed',
            screenshotPath, tracePath, domSnapshotPath, timeTakenMs: timeTakenMs(), logs: logs.slice(logsStartIndex),
            failureType: classification.failureType, attempts: analysis.attempts || 0,
            codeSnippet: buildCodeSnippet(locatorKey, owner.propertyName, analysis.suggestedLocator),
          };
          records.push(record);
          log(`Healing cycle complete in ${timeTakenMs()}ms — status: HEALED`, 'done');
          break;
        }

        const nextLocator = extractSelectorFromMessage(retry.failureMessage);
        const advancedPastThisLocator = nextLocator && nextLocator !== currentOldLocator;

        if (advancedPastThisLocator) {
          // The retry progressed past the locator we just fixed and failed
          // on a DIFFERENT one — proof this fix was correct. Keep it (do
          // NOT reject) and loop to heal the newly-exposed locator too.
          log(`This fix resolved "${currentOldLocator}" — the retry advanced further and hit a separate broken locator ("${nextLocator}"). Keeping this fix and continuing to heal the next one...`);
          record = {
            id: uuidv4(), runId, locatorKey, testFile, failedTests: failedTestNames,
            oldLocator: currentOldLocator, newLocator: analysis.suggestedLocator, rootCause: `${resolverTag} ${analysis.rootCause}`.trim(),
            confidenceScore: analysis.confidence, liveVerified: true, healingStatus: 'healed', retryStatus: 'passed_partial',
            screenshotPath, tracePath, domSnapshotPath, timeTakenMs: timeTakenMs(), logs: logs.slice(logsStartIndex),
            failureType: classification.failureType, attempts: analysis.attempts || 0,
            codeSnippet: buildCodeSnippet(locatorKey, owner.propertyName, analysis.suggestedLocator),
          };
          records.push(record);
          currentOldLocator = nextLocator;
          currentStackTrace = retry.failureStack || null;
          currentCapture = readFailureCapture(testName);
          continue;
        }

        // Same locator still broken (or no locator identifiable in the
        // retry failure) — this fix genuinely didn't work in practice. Pull
        // it out of rotation immediately so no subsequent run keeps
        // resolving to a locator that doesn't actually work.
        rejectLocator(repositoryEntry.id);
        log('Retry failed against the same locator — rejected the repository entry; runtime resolution reverts to the Page Object default.', 'done');
        record = {
          id: uuidv4(), runId, locatorKey, testFile, failedTests: failedTestNames,
          oldLocator: currentOldLocator, newLocator: analysis.suggestedLocator, rootCause: `${resolverTag} ${analysis.rootCause}`.trim(),
          confidenceScore: analysis.confidence, liveVerified: true, healingStatus: 'not_fixable', retryStatus: 'failed',
          screenshotPath, tracePath, domSnapshotPath, timeTakenMs: timeTakenMs(), logs: logs.slice(logsStartIndex),
          failureType: classification.failureType, attempts: analysis.attempts || 0,
        };
        records.push(record);
        break;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    if (runId) activeCycles.delete(runId);
  }

  // If we hit MAX_LOCATORS_PER_CYCLE while still finding new broken locators
  // in a chain, every fix found so far was individually correct (each got
  // validated by the retry advancing past it) — but the test as a whole was
  // never actually confirmed passing. Report that honestly instead of
  // inheriting the last iteration's 'healed'/'passed_partial' status, which
  // would otherwise tell the caller the whole test passed when it didn't.
  const last = records[records.length - 1];
  if (last?.retryStatus === 'passed_partial') {
    last.healingStatus = 'not_fixable';
    last.rootCause = `${last.rootCause} [Reached the ${MAX_LOCATORS_PER_CYCLE}-locator-per-cycle limit — every fix found so far is valid and stays active, but the test may still be blocked by further broken locators beyond this cap.]`;
    log(`Reached the ${MAX_LOCATORS_PER_CYCLE}-locator-per-cycle limit with more broken locators still ahead — keeping all fixes found so far, but not marking this cycle as fully healed.`, 'done');
  }

  for (const r of records) persistDemoHealingRun(r);
  return records[records.length - 1] || null;
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
  runHealingCycle, extractSelectorFromMessage,
  getDemoHealingRuns, getActiveCycle, retryTest,
};
