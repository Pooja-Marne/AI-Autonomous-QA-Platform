const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { getDatabase } = require('../config/database');
const { healMultipleTestCases } = require('./aiHealing.service');
const { generateReport } = require('./reporting.service');
const { sendSlackNotification } = require('./slack.service');

const TESTS_DIR = path.resolve(__dirname, '../../../tests');
const RESULTS_FILE = path.join(TESTS_DIR, 'playwright-results.json');

const SUITE_PATTERNS = {
  smoke:          '--grep @smoke',
  full_regression: '',
  api:            '--grep @api',
  ui:             '--grep @ui',
  cart:           'playwright/specs/cart',
  checkout:       'playwright/specs/checkout',
  login:          'playwright/specs/auth',
  inventory:      'playwright/specs/inventory',
  e2e:            'playwright/specs/e2e',
};

async function runPlaywrightTests(suite = 'smoke') {
  return new Promise((resolve, reject) => {
    const pattern = SUITE_PATTERNS[suite] ?? SUITE_PATTERNS.smoke;
    const args = [
      'playwright', 'test',
      '--reporter=json',
      '--output', RESULTS_FILE,
      ...(pattern ? pattern.split(' ') : []),
    ];

    console.log(`[Playwright] Running: npx ${args.join(' ')}`);

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
      // Playwright exits with 1 when tests fail — that's normal, not an error
      resolve({ stdout, stderr, exitCode: code });
    });

    proc.on('error', (err) => reject(err));
  });
}

function parsePlaywrightResults(rawOutput) {
  // Try to extract the JSON blob from stdout (Playwright JSON reporter outputs to stdout)
  try {
    // stdout may contain logs before the JSON — find the first '{'
    const jsonStart = rawOutput.indexOf('{');
    if (jsonStart !== -1) {
      const jsonStr = rawOutput.substring(jsonStart);
      return JSON.parse(jsonStr);
    }
  } catch {
    /* fall through */
  }

  // Try reading the results file Playwright wrote
  try {
    if (fs.existsSync(RESULTS_FILE)) {
      const content = fs.readFileSync(RESULTS_FILE, 'utf-8');
      return JSON.parse(content);
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
            errorMessage: error?.message?.replace(/\u001b\[[0-9;]*m/g, '').substring(0, 500) || null,
            stackTrace: error?.stack?.replace(/\u001b\[[0-9;]*m/g, '').substring(0, 2000) || null,
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
  const runName = `${suiteName} - ${new Date().toISOString().split('T')[0]} [Playwright]`;

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
    const { stdout, exitCode } = await runPlaywrightTests(suite);
    const pwResults = parsePlaywrightResults(stdout);

    if (!pwResults) {
      console.warn('[Playwright Runner] Could not parse results — marking run as failed');
      db.prepare(`UPDATE test_runs SET status='failed', total_tests=0 WHERE id=?`).run(runId);
      return;
    }

    const testCases = mapPlaywrightResults(pwResults);
    console.log(`[Playwright Runner] Parsed ${testCases.length} test cases`);

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

module.exports = { startPlaywrightRun };
