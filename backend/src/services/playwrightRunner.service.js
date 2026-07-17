const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../config/database');
const { healMultipleTestCases } = require('./aiHealing.service');
const { runHealingCycle, extractSelectorFromMessage } = require('./demoHealingAgent.service');
const { generateReport } = require('./reporting.service');
const { sendSlackNotification } = require('./slack.service');
const { withTimeout } = require('../utils/withTimeout');

// Hard ceilings so a hang anywhere inside the pipeline (browser launch,
// AI call, child process) can never leave a run stuck on "Running"/"Healing"
// forever — the run always transitions to a terminal status within these
// bounds, even if the underlying cause is never fixed.
const RUN_TIMEOUT_MS = 8 * 60 * 1000; // whole pipeline: spawn Playwright + all healing
const HEALING_CYCLE_TIMEOUT_MS = 4 * 60 * 1000; // one real self-healing cycle

const TESTS_DIR = path.resolve(__dirname, '../../../tests');

// Only 'chromium' has its browser binary installed in the production image
// (see Dockerfile) — keep this in sync with whatever `playwright install`
// actually installs there.
const PROJECT = 'chromium';

// All tests run against the AI Healing Demo Site (a disposable static app
// deployed separately — see tests/test.env's BASE_URL). full_regression and
// regression both run everything; smoke runs a fast representative subset
// tagged @smoke across every module.
const SUITE_PATTERNS = {
  full_regression: [],
  regression: [],
  smoke: ['--grep', '@smoke'],
  auth: ['specs/auth.spec.js'],
  dashboard: ['specs/dashboard.spec.js'],
  navigation: ['specs/navigation.spec.js'],
  orders: ['specs/orders.spec.js'],
  products: ['specs/products.spec.js'],
  users: ['specs/users.spec.js'],
};

// These must match slugifyModule()'s output for each spec file's actual
// describe() block title — used only to seed the live per-module progress
// map for the in-progress run view (cosmetic; healing/results correctness
// doesn't depend on this list).
const ALL_MODULES = ['login_logout', 'dashboard_cards', 'navigation_menu', 'orders', 'products', 'users'];

const SUITE_MODULES = {
  full_regression: ALL_MODULES,
  regression: ALL_MODULES,
  smoke: ALL_MODULES,
  auth: ['login_logout'],
  dashboard: ['dashboard_cards'],
  navigation: ['navigation_menu'],
  orders: ['orders'],
  products: ['products'],
  users: ['users'],
};

// In-progress runs, keyed by runId — this is what makes the UI genuinely
// real-time: the JSON reporter only ever produces output once, at the very
// end, so without this there is nothing to show while a run is executing.
// The `list` reporter prints one line per test as it finishes, so we tee
// stdout to this map as chunks arrive and let /api/runs/:id/live poll it.
// Entries are removed once the run leaves this file's control (terminal
// status persisted, or handed off to the healing agent).
const activeRuns = new Map();
const MAX_LIVE_LOG_LINES = 300;

function getActiveRun(runId) {
  return activeRuns.get(runId) || null;
}

function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function ingestListLine(runId, rawLine) {
  const entry = activeRuns.get(runId);
  if (!entry) return;
  const line = stripAnsi(rawLine).trim();
  if (!line) return;

  entry.logs.push(line);
  if (entry.logs.length > MAX_LIVE_LOG_LINES) entry.logs.shift();

  // Best-effort per-module status from the list reporter's line shape:
  // "  ✓  1 [chromium] › specs/auth.spec.js:10:3 › Login / Logout › ..."
  // (✘ for failures). The module name comes straight from the test's own
  // describe() block title — not a keyword-matching guess.
  const titleMatch = line.match(/›\s*[\w./-]+\.spec\.js:\d+:\d+\s*›\s*([^›]+?)\s*›/);
  if (titleMatch) {
    const module = slugifyModule(titleMatch[1]);
    const mod = entry.modules[module];
    if (mod) {
      if (/^[✘x✗]/i.test(line) || line.includes(' failed')) mod.status = 'failed';
      else if (mod.status === 'pending') mod.status = 'running';
      mod.seen += 1;
    }
  }
}

async function runPlaywrightTests(suite, runId) {
  return new Promise((resolve, reject) => {
    const extraArgs = SUITE_PATTERNS[suite] ?? SUITE_PATTERNS.smoke;
    const jsonOutputPath = path.join(TESTS_DIR, `.run-result-${runId}.json`);
    const args = ['playwright', 'test', '--reporter=list,json', `--project=${PROJECT}`, ...extraArgs];

    console.log(`[Playwright] Running: npx ${args.join(' ')} (cwd=${TESTS_DIR})`);

    const proc = spawn('npx', args, {
      cwd: TESTS_DIR,
      shell: true,
      timeout: 300000, // 5 min max
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonOutputPath },
    });

    let stderr = '';
    let buffer = '';

    proc.stdout.on('data', (d) => {
      buffer += d.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep the last, possibly-incomplete line for next chunk
      for (const line of lines) ingestListLine(runId, line);
    });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (buffer.trim()) ingestListLine(runId, buffer);
      console.log(`[Playwright] Exit code: ${code}`);
      // Playwright exits with 1 when tests fail — that's normal, not an error.
      // Only log stderr when something actually looks wrong, to keep logs clean.
      if (code !== 0 && code !== 1) console.error(`[Playwright] stderr:\n${stderr.slice(0, 3000)}`);

      let json = null;
      try {
        json = JSON.parse(fs.readFileSync(jsonOutputPath, 'utf-8'));
      } catch (err) {
        console.error(`[Playwright] Could not read JSON result file: ${err.message}`);
      } finally {
        fs.unlink(jsonOutputPath, () => {});
      }
      resolve({ json, stderr, exitCode: code });
    });

    proc.on('error', (err) => reject(err));
  });
}

function mapPlaywrightResults(pwResults) {
  const testCases = [];
  if (!pwResults?.suites) return testCases;

  // "module" is derived directly from the test's own describe() block
  // title (e.g. "Login / Logout", "Orders") — not a keyword-matching guess
  // against the file path/test name.
  function walkSuites(suites, parentFile = '', describeTitle = '') {
    for (const suite of suites) {
      const file = suite.file || parentFile;
      const title = suite.title || describeTitle;
      if (suite.suites) walkSuites(suite.suites, file, title);
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const result = test.results?.[0] || {};
          const status = result.status === 'passed' ? 'passed'
            : result.status === 'failed' ? 'failed'
            : result.status === 'skipped' ? 'skipped'
            : 'failed';

          const error = result.error;
          testCases.push({
            name: spec.title,
            module: slugifyModule(title),
            filePath: file,
            status,
            duration_ms: result.duration || 0,
            errorMessage: error?.message?.replace(/\[[0-9;]*m/g, '').substring(0, 500) || null,
            stackTrace: error?.stack?.replace(/\[[0-9;]*m/g, '').substring(0, 2000) || null,
          });
        }
      }
    }
  }

  walkSuites(pwResults.suites);
  return testCases;
}

function slugifyModule(describeTitle) {
  const slug = (describeTitle || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return slug || 'ui';
}

async function startPlaywrightRun({ suite = 'smoke', trigger = 'manual', jiraIssueKey } = {}) {
  const db = getDatabase();
  const runId = uuidv4();
  const suiteName = suite.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const runName = `${suiteName} - ${new Date().toISOString().split('T')[0]}`;

  console.log(`[Playwright Runner] Starting run ${runId} | Suite: ${suite}`);

  // Cheap (one row read + string compare) — catches a deploy that landed
  // between backend boot and this run without needing a restart to notice.
  require('./locatorRepository.service').checkAndInvalidateOnVersionChange();

  db.prepare(`
    INSERT INTO test_runs (id, name, status, trigger_type, branch, total_tests, started_at, suite)
    VALUES (?, ?, 'running', ?, 'playwright', 0, ?, ?)
  `).run(runId, runName, trigger, new Date().toISOString(), suite);

  // Run async, but never let it hang the row forever: if the whole pipeline
  // (Playwright process, browser launch, AI calls, retries) doesn't settle
  // within RUN_TIMEOUT_MS, force the row to a terminal state ourselves. The
  // underlying call may still be running in the background at that point —
  // we simply stop waiting on it and stop trusting its result.
  withTimeout(runAndProcess(runId, suite, runName, trigger), RUN_TIMEOUT_MS, `Playwright run ${runId}`)
    .catch((err) => {
      console.error('[Playwright Runner] Fatal error:', err.message);
      db.prepare(`
        UPDATE test_runs SET status='failed', completed_at=?
        WHERE id=? AND status IN ('running', 'healing')
      `).run(new Date().toISOString(), runId);
    });

  return { runId, name: runName, status: 'running' };
}

async function runAndProcess(runId, suite, runName, trigger) {
  const db = getDatabase();

  let passed = 0, failed = 0, skipped = 0;
  const failedCases = [];

  const modules = SUITE_MODULES[suite] ?? SUITE_MODULES.smoke;
  activeRuns.set(runId, {
    suite,
    logs: [],
    modules: Object.fromEntries(modules.map((m) => [m, { status: 'pending', seen: 0 }])),
  });

  try {
    const { json: pwResults, stderr, exitCode } = await runPlaywrightTests(suite, runId);

    // Persist the incremental logs captured during execution now, while
    // they're still in memory — activeRuns is deleted once this function
    // returns, and without this, historical "runtime logs" browsing would
    // have nothing to show for any run older than the current in-progress one.
    const capturedLogs = activeRuns.get(runId)?.logs || [];
    db.prepare(`UPDATE test_runs SET execution_logs=? WHERE id=?`).run(JSON.stringify(capturedLogs), runId);

    if (!pwResults) {
      console.error(`[Playwright Runner] Could not parse results (exit ${exitCode}) — marking run as failed. stderr:\n${stderr.slice(0, 2000)}`);
      db.prepare(`UPDATE test_runs SET status='failed', total_tests=0, completed_at=? WHERE id=?`).run(new Date().toISOString(), runId);
      return;
    }

    const testCases = mapPlaywrightResults(pwResults);
    console.log(`[Playwright Runner] Parsed ${testCases.length} test cases`);

    if (testCases.length === 0) {
      console.error(`[Playwright Runner] 0 tests matched suite "${suite}" — treating as a failed run, not a pass. stderr:\n${stderr.slice(0, 2000)}`);
      db.prepare(`
        UPDATE test_runs SET status='failed', total_tests=0, completed_at=?,
          duration_ms=CAST((julianday(?)-julianday(started_at))*86400000 AS INTEGER)
        WHERE id=?
      `).run(new Date().toISOString(), new Date().toISOString(), runId);
      return;
    }

    db.prepare(`UPDATE test_runs SET total_tests=? WHERE id=?`).run(testCases.length, runId);

    for (const tc of testCases) {
      const tcId = uuidv4();
      db.prepare(`
        INSERT INTO test_cases (id, run_id, name, module, status, error_message, stack_trace, duration_ms, file_path)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tcId, runId, tc.name, tc.module, tc.status, tc.errorMessage, tc.stackTrace, tc.duration_ms, tc.filePath);

      if (tc.status === 'passed') passed++;
      else if (tc.status === 'skipped') skipped++;
      else {
        failed++;
        failedCases.push({
          id: tcId, runId, name: tc.name, module: tc.module, filePath: tc.filePath,
          errorMessage: tc.errorMessage, stackTrace: tc.stackTrace,
          originalSelector: null, jiraIssueKey: null,
        });
      }
    }

    // AI Healing for failures, tiered by what's actually verifiable:
    //  1. Any selector Playwright reported as unresolvable — the real
    //     self-healing cycle: live DOM capture, real AI analysis, live
    //     verification, and a real retry, with the fix recorded in the
    //     Centralized Locator Repository (never written directly into
    //     source — see demoHealingAgent.service.js).
    //  2. Failures with no locator at all (assertion/timeout/network) — no
    //     DOM-based fix is possible; these are diagnosed (real OpenAI call)
    //     but never silently marked "healed" — see aiHealing.service.js.
    let healed = 0, notFixable = 0;
    let remainingFailedCases = failedCases;

    if (remainingFailedCases.length > 0) {
      // Grouped by the broken selector ALONE, not selector+module: the same
      // broken locator (e.g. a shared login-flow field) surfaces across
      // every module whose tests log in first, and it's the exact same
      // underlying fix — healing it once per module wastes cycles and, worse,
      // can produce wrong fixes, since most modules' reproduce() steps
      // hard-code a working login just to get past it, landing the DOM
      // capture on a page where the broken element doesn't even belong.
      const byGenericSelector = new Map();
      const noSelector = [];
      for (const fc of remainingFailedCases) {
        const selector = extractSelectorFromMessage(fc.errorMessage);
        if (!selector) { noSelector.push(fc); continue; }
        if (!byGenericSelector.has(selector)) byGenericSelector.set(selector, []);
        byGenericSelector.get(selector).push(fc);
      }

      for (const [key, cases] of byGenericSelector) {
        // Any one failing test case is a sufficient, exact representative:
        // the healing cycle reproduces via that SPECIFIC test's own
        // captured failure state (see readFailureCapture in
        // demoHealingAgent.service.js) rather than a per-module navigation
        // script, so there's no "which module reproduces this correctly"
        // question to resolve here anymore.
        const reproduceCase = cases[0];
        console.log(`[Playwright Runner] Routing unrecognized broken selector "${key}" (seen in ${[...new Set(cases.map((c) => c.module))].join(', ')}) to the self-healing agent...`);
        db.prepare(`UPDATE test_runs SET status='healing' WHERE id=?`).run(runId);
        const result = await withTimeout(
          runHealingCycle({
            module: reproduceCase.module, runId, testFile: reproduceCase.filePath, testName: reproduceCase.name,
            failedTestNames: cases.map((c) => c.name), errorMessage: reproduceCase.errorMessage,
            stackTrace: reproduceCase.stackTrace,
          }),
          HEALING_CYCLE_TIMEOUT_MS,
          `Self-healing cycle for ${key}`
        ).catch((err) => {
          console.error(`[Playwright Runner] Self-healing cycle failed or timed out:`, err.message);
          return null;
        });

        const isHealed = result?.healingStatus === 'healed';
        for (const c of cases) {
          if (isHealed) { healed++; failed--; }
          else notFixable++;
          db.prepare(`UPDATE test_cases SET healing_status=?, status=? WHERE id=?`)
            .run(isHealed ? 'healed' : 'not_fixable', isHealed ? 'healed' : 'failed', c.id);
        }
      }
      remainingFailedCases = noSelector;
    }

    if (remainingFailedCases.length > 0) {
      // No locator to heal — mostly diagnosed only (real OpenAI call, honest
      // reasoning, never auto-marked as healed by chance), EXCEPT timeout
      // failures, which get one real, live-verified remediation attempt
      // first (see aiHealing.service.js's healTestCase / timeoutRemediation.
      // service.js) — so results here are a genuine mix of healed/not_fixable,
      // not uniformly not_fixable like before.
      console.log(`[Playwright Runner] ${remainingFailedCases.length} non-locator failures — diagnosing (timeouts also get a live-verified remediation attempt)...`);
      const results = await healMultipleTestCases(remainingFailedCases);
      for (const result of results) {
        if (result?.healingStatus === 'healed') { healed++; failed--; }
        else notFixable++;
      }
    }

    const completedAt = new Date().toISOString();
    db.prepare(`
      UPDATE test_runs SET
        status=?, passed=?, failed=?, healed=?, skipped=?, not_fixable=?,
        completed_at=?,
        duration_ms=CAST((julianday(?)-julianday(started_at))*86400000 AS INTEGER)
      WHERE id=?
    `).run(
      failed === 0 ? 'passed' : healed > 0 ? 'partially_healed' : 'failed',
      passed, failed, healed, skipped, notFixable,
      completedAt, completedAt, runId
    );

    await generateReport(runId).catch(() => {});
    await sendSlackNotification({ runId, name: runName, status: failed === 0 ? 'passed' : 'failed', passed, failed, healed, notFixable, total: testCases.length }).catch(() => {});

    console.log(`[Playwright Runner] Run ${runId} complete: ${passed}P/${failed}F/${healed}H`);
  } catch (err) {
    console.error('[Playwright Runner] Error:', err.message);
    db.prepare(`UPDATE test_runs SET status='failed' WHERE id=?`).run(runId);
  } finally {
    activeRuns.delete(runId);
  }
}

async function getRunById(runId) {
  const db = getDatabase();
  const run = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(runId);
  if (!run) return null;

  const testCases = db.prepare(`
    SELECT tc.*,
      ji.summary      AS jira_summary,
      ji.status       AS jira_status,
      ji.priority     AS jira_priority,
      ji.assignee     AS jira_assignee,
      ji.type         AS jira_issue_type,
      ji.description  AS jira_description
    FROM test_cases tc
    LEFT JOIN jira_issues ji ON tc.jira_issue_key = ji.key
    WHERE tc.run_id = ?
    ORDER BY tc.created_at
  `).all(runId).map((tc) => ({
    ...tc,
    jira_url: tc.jira_issue_key
      ? `${require('../config/config').jira.baseUrl}/browse/${tc.jira_issue_key}`
      : null,
  }));

  const healingActions = db.prepare('SELECT * FROM healing_actions WHERE run_id = ? ORDER BY created_at').all(runId);

  // demo_healing_runs carries the rich, presentation-oriented detail (real
  // screenshot/trace/DOM artifacts, live-verified locator diff, step logs)
  // that the AI Healing execution-detail view needs beyond healing_actions.
  const demoHealingRuns = db.prepare('SELECT * FROM demo_healing_runs WHERE run_id = ? ORDER BY created_at').all(runId).map((r) => ({
    ...r,
    failedTests: JSON.parse(r.failed_tests || '[]'),
    logs: JSON.parse(r.logs || '[]'),
    liveVerified: Boolean(r.live_verified),
  }));

  return {
    ...run,
    executionLogs: JSON.parse(run.execution_logs || '[]'),
    testCases, healingActions, demoHealingRuns,
  };
}

// Latest-first execution history for a given suite key (e.g. 'smoke',
// 'login', 'full_regression') — powers the AI Healing page's "click a
// suite, see its most recent runs" browsing view.
async function getRunsBySuite(suite, { limit = 10, page = 1 } = {}) {
  const db = getDatabase();
  const offset = (page - 1) * limit;
  const runs = db.prepare('SELECT * FROM test_runs WHERE suite = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(suite, limit, offset);
  const total = db.prepare('SELECT COUNT(*) as count FROM test_runs WHERE suite = ?').get(suite).count;
  return { runs, total, page, limit };
}

// Most recent execution across every suite — used to populate the AI
// Healing page by default when it's opened, before any suite is picked.
async function getLatestRun() {
  const db = getDatabase();
  return db.prepare('SELECT * FROM test_runs ORDER BY created_at DESC LIMIT 1').get() || null;
}

async function getAllRuns({ page = 1, limit = 20 } = {}) {
  const db = getDatabase();
  const offset = (page - 1) * limit;
  const runs = db.prepare('SELECT * FROM test_runs ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  const total = db.prepare('SELECT COUNT(*) as count FROM test_runs').get().count;
  return { runs, total, page, limit };
}

async function getTestStats() {
  const db = getDatabase();
  const overall = db.prepare(`
    SELECT
      COUNT(*) as total_runs,
      SUM(passed) as total_passed,
      SUM(failed) as total_failed,
      SUM(healed) as total_healed,
      SUM(not_fixable) as total_not_fixable,
      SUM(total_tests) as total_test_cases,
      AVG(CASE WHEN total_tests > 0 THEN CAST(passed AS REAL) / total_tests * 100 ELSE 0 END) as avg_pass_rate,
      AVG(CASE WHEN total_tests > 0 THEN CAST(healed AS REAL) / total_tests * 100 ELSE 0 END) as avg_healing_rate
    FROM test_runs WHERE status NOT IN ('running', 'pending')
  `).get();

  const recentRuns = db.prepare('SELECT * FROM test_runs ORDER BY created_at DESC LIMIT 10').all();
  const failuresByModule = db.prepare(`
    SELECT module, COUNT(*) as failures, SUM(CASE WHEN healing_status = 'healed' THEN 1 ELSE 0 END) as healed
    FROM test_cases WHERE status IN ('failed', 'healed')
    GROUP BY module ORDER BY failures DESC LIMIT 10
  `).all();

  return { overall, recentRuns, failuresByModule };
}

module.exports = { startPlaywrightRun, getRunById, getAllRuns, getTestStats, getActiveRun, getRunsBySuite, getLatestRun };
