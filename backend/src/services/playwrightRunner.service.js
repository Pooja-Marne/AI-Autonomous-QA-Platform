const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../config/database');
const { healMultipleTestCases } = require('./aiHealing.service');
const { generateReport } = require('./reporting.service');
const { sendSlackNotification } = require('./slack.service');

const TESTS_DIR = path.resolve(__dirname, '../../../tests');

// Only 'chromium' has its browser binary installed in the production image
// (see Dockerfile) — keep this in sync with whatever `playwright install`
// actually installs there.
const PROJECT = 'chromium';

const SUITE_PATTERNS = {
  full_regression: [],
  smoke: ['--grep', '@smoke'],
  regression: ['--grep', '@regression'],
  login: ['specs/auth/'],
  cart: ['specs/cart/'],
  checkout: ['specs/checkout/'],
  inventory: ['specs/inventory/'],
  e2e: ['specs/e2e/'],
};

async function runPlaywrightTests(suite = 'smoke') {
  return new Promise((resolve, reject) => {
    const extraArgs = SUITE_PATTERNS[suite] ?? SUITE_PATTERNS.smoke;
    const args = ['playwright', 'test', '--reporter=json', `--project=${PROJECT}`, ...extraArgs];

    console.log(`[Playwright] Running: npx ${args.join(' ')} (cwd=${TESTS_DIR})`);

    const proc = spawn('npx', args, {
      cwd: TESTS_DIR,
      shell: true,
      timeout: 300000, // 5 min max
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      console.log(`[Playwright] Exit code: ${code}`);
      // Playwright exits with 1 when tests fail — that's normal, not an error.
      // Only log stderr when something actually looks wrong, to keep logs clean.
      if (code !== 0 && code !== 1) console.error(`[Playwright] stderr:\n${stderr.slice(0, 3000)}`);
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on('error', (err) => reject(err));
  });
}

function parsePlaywrightResults(rawOutput) {
  try {
    const jsonStart = rawOutput.indexOf('{');
    if (jsonStart !== -1) {
      return JSON.parse(rawOutput.substring(jsonStart));
    }
  } catch {
    /* fall through */
  }
  return null;
}

function mapPlaywrightResults(pwResults) {
  const testCases = [];
  if (!pwResults?.suites) return testCases;

  function walkSuites(suites, parentFile = '') {
    for (const suite of suites) {
      const file = suite.file || parentFile;
      if (suite.suites) walkSuites(suite.suites, file);
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
            module: deriveModule(file, spec.title),
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

function deriveModule(filePath, title) {
  const f = (filePath || '').toLowerCase();
  if (f.includes('auth') || f.includes('login')) return 'auth';
  if (f.includes('cart')) return 'cart';
  if (f.includes('checkout')) return 'checkout';
  if (f.includes('inventory') || f.includes('product')) return 'inventory';
  if (f.includes('e2e')) return 'e2e';
  const t = (title || '').toLowerCase();
  if (t.includes('login') || t.includes('auth')) return 'auth';
  if (t.includes('cart')) return 'cart';
  if (t.includes('checkout')) return 'checkout';
  return 'ui';
}

async function startPlaywrightRun({ suite = 'smoke', trigger = 'manual', jiraIssueKey } = {}) {
  const db = getDatabase();
  const runId = uuidv4();
  const suiteName = suite.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const runName = `${suiteName} - ${new Date().toISOString().split('T')[0]}`;

  console.log(`[Playwright Runner] Starting run ${runId} | Suite: ${suite}`);

  db.prepare(`
    INSERT INTO test_runs (id, name, status, trigger_type, branch, total_tests, started_at)
    VALUES (?, ?, 'running', ?, 'playwright', 0, ?)
  `).run(runId, runName, trigger, new Date().toISOString());

  // Run async
  runAndProcess(runId, suite, runName, trigger).catch((err) => {
    console.error('[Playwright Runner] Fatal error:', err.message);
    db.prepare(`UPDATE test_runs SET status='failed' WHERE id=?`).run(runId);
  });

  return { runId, name: runName, status: 'running' };
}

async function runAndProcess(runId, suite, runName, trigger) {
  const db = getDatabase();

  let passed = 0, failed = 0, skipped = 0;
  const failedCases = [];

  try {
    const { stdout, stderr, exitCode } = await runPlaywrightTests(suite);
    const pwResults = parsePlaywrightResults(stdout);

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
          id: tcId, runId, name: tc.name, module: tc.module,
          errorMessage: tc.errorMessage, stackTrace: tc.stackTrace,
          originalSelector: null, jiraIssueKey: null,
        });
      }
    }

    // AI Healing for failures
    let healed = 0, notFixable = 0;
    if (failedCases.length > 0) {
      console.log(`[Playwright Runner] ${failedCases.length} failures — starting AI healing...`);
      db.prepare(`UPDATE test_runs SET status='healing' WHERE id=?`).run(runId);
      const healingResults = await healMultipleTestCases(failedCases);
      for (const r of healingResults) {
        if (r.healingStatus === 'healed') { healed++; failed--; }
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
  return { ...run, testCases, healingActions };
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

module.exports = { startPlaywrightRun, getRunById, getAllRuns, getTestStats };
