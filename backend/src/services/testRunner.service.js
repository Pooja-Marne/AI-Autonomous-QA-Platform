const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../config/database');
const { healMultipleTestCases } = require('./aiHealing.service');
const { fetchLatestCommits, fetchOpenPRs, detectImpactedModules } = require('./github.service');
const { fetchActiveSprintIssues } = require('./jira.service');
const { generateReport } = require('./reporting.service');
const { sendSlackNotification } = require('./slack.service');

const TEST_SUITES = {
  full_regression: {
    name: 'Full Regression Suite',
    modules: ['auth', 'dashboard', 'api', 'database', 'ui', 'services'],
    testCaseTemplates: generateFullRegressionTests(),
  },
  smoke: {
    name: 'Smoke Test Suite',
    modules: ['auth', 'dashboard'],
    testCaseTemplates: generateSmokeTests(),
  },
  api: {
    name: 'API Test Suite',
    modules: ['api', 'services'],
    testCaseTemplates: generateApiTests(),
  },
  ui: {
    name: 'UI Test Suite',
    modules: ['ui', 'dashboard'],
    testCaseTemplates: generateUITests(),
  },
};

async function startTestRun({ suite = 'full_regression', trigger = 'manual', branch, prNumber, jiraIssueKey } = {}) {
  const db = getDatabase();
  const runId = uuidv4();

  console.log(`[TestRunner] Starting run: ${runId} | Suite: ${suite} | Trigger: ${trigger}`);

  // Fetch latest Git + Jira data in parallel
  const [commits, jiraData] = await Promise.all([
    fetchLatestCommits(branch || 'master', 3).catch(() => []),
    fetchActiveSprintIssues().catch(() => ({ issues: [], sprint: null })),
  ]);

  const latestCommit = commits[0];
  const testSuite = TEST_SUITES[suite] || TEST_SUITES.full_regression;

  // ── Build test templates from real Jira issues first ──────────────────────
  const jiraIssues = jiraData.issues || [];
  let testTemplates;

  // If we have Jira issues, use them as the primary source of test cases.
  // Filter based on suite if needed (e.g., jira_story only runs single-issue).
  if (jiraIssues.length > 0 && suite !== 'smoke') {
    // For a single-issue trigger (jira_story / jira_trigger), run only that issue
    const scopedIssues = jiraIssueKey
      ? jiraIssues.filter((i) => i.key === jiraIssueKey)
      : jiraIssues;

    const jiraDerivedTemplates = buildJiraTestCases(scopedIssues.length > 0 ? scopedIssues : jiraIssues);

    // Merge Jira-derived templates with the suite's built-in templates,
    // giving priority to Jira-derived ones (de-duped by name).
    const staticTemplates = testSuite.testCaseTemplates.filter(
      (t) => !jiraDerivedTemplates.some((jt) => jt.module === t.module && t.jiraIssueKey)
    );
    testTemplates = [...jiraDerivedTemplates, ...staticTemplates];
    console.log(`[TestRunner] Using ${jiraDerivedTemplates.length} Jira-derived + ${staticTemplates.length} static test cases`);
  } else {
    testTemplates = [...testSuite.testCaseTemplates];
    console.log(`[TestRunner] No Jira issues found — using ${testTemplates.length} static test templates`);
  }

  // PR-based selective filtering
  if (prNumber) {
    const prs = await fetchOpenPRs().catch(() => []);
    const pr = prs.find((p) => p.number === prNumber);
    if (pr?.impactedModules?.length) {
      testTemplates = testTemplates.filter((t) => pr.impactedModules.includes(t.module) || t.critical);
      console.log(`[TestRunner] Selective run: ${testTemplates.length} tests based on PR #${prNumber}`);
    }
  }

  const run = {
    id: runId,
    name: `${testSuite.name} - ${new Date().toISOString().split('T')[0]}`,
    status: 'running',
    trigger_type: trigger,
    branch: branch || 'master',
    commit_sha: latestCommit?.sha || null,
    jira_sprint: jiraData.sprint || null,
    total_tests: testTemplates.length,
    passed: 0,
    failed: 0,
    healed: 0,
    skipped: 0,
    not_fixable: 0,
    started_at: new Date().toISOString(),
  };

  db.prepare(`
    INSERT INTO test_runs (id, name, status, trigger_type, branch, commit_sha, jira_sprint, total_tests, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(run.id, run.name, run.status, run.trigger_type, run.branch, run.commit_sha, run.jira_sprint, run.total_tests, run.started_at);

  const testCases = createTestCases(runId, testTemplates, jiraIssues);
  testCases.forEach((tc) => {
    db.prepare(`
      INSERT INTO test_cases (id, run_id, name, module, description, status, jira_issue_key, file_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(tc.id, tc.runId, tc.name, tc.module, tc.description, 'pending', tc.jiraIssueKey, tc.filePath);
  });

  executeTestsAsync(runId, testCases, run);

  return { runId, name: run.name, totalTests: run.total_tests, status: 'running' };
}

async function executeTestsAsync(runId, testCases, run) {
  const db = getDatabase();
  let passed = 0, failed = 0, skipped = 0;
  const failedCases = [];

  for (const tc of testCases) {
    const result = await simulateTestExecution(tc);
    const durationMs = 500 + Math.floor(Math.random() * 2000);

    db.prepare(`
      UPDATE test_cases SET
        status = ?, error_message = ?, stack_trace = ?, duration_ms = ?,
        original_selector = ?, git_commit = ?
      WHERE id = ?
    `).run(
      result.status,
      result.errorMessage || null,
      result.stackTrace || null,
      durationMs,
      result.originalSelector || null,
      run.commit_sha || null,
      tc.id
    );

    if (result.status === 'passed') passed++;
    else if (result.status === 'skipped') skipped++;
    else {
      failed++;
      failedCases.push({ ...tc, errorMessage: result.errorMessage, stackTrace: result.stackTrace, originalSelector: result.originalSelector, runId });
    }

    await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));
  }

  let healed = 0, notFixable = 0;

  if (failedCases.length > 0) {
    console.log(`[TestRunner] ${failedCases.length} failures detected. Starting AI healing...`);
    db.prepare(`UPDATE test_runs SET status = 'healing' WHERE id = ?`).run(runId);
    const healingResults = await healMultipleTestCases(failedCases);

    for (const result of healingResults) {
      if (result.healingStatus === 'healed') {
        healed++;
        failed--;
      } else {
        notFixable++;
      }
    }
  }

  const completedAt = new Date().toISOString();
  db.prepare(`
    UPDATE test_runs SET
      status = 'completed', passed = ?, failed = ?, healed = ?, skipped = ?,
      not_fixable = ?, completed_at = ?,
      duration_ms = CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER)
    WHERE id = ?
  `).run(passed, failed, healed, skipped, notFixable, completedAt, completedAt, runId);

  const report = await generateReport(runId);

  const finalStatus = failed === 0 ? 'passed' : healed > 0 ? 'partially_healed' : 'failed';
  db.prepare(`UPDATE test_runs SET status = ? WHERE id = ?`).run(finalStatus, runId);

  await sendSlackNotification({
    runId,
    name: run.name,
    status: finalStatus,
    passed,
    failed,
    healed,
    notFixable,
    total: testCases.length,
  }).catch(() => {});

  console.log(`[TestRunner] Run ${runId} completed: ${passed}P/${failed}F/${healed}H/${notFixable}NF`);
}

async function simulateTestExecution(testCase) {
  const failureScenarios = getFailureScenarios();
  const shouldFail = Math.random() < testCase.failureProbability;
  const shouldSkip = Math.random() < 0.05;

  if (shouldSkip) return { status: 'skipped' };
  if (!shouldFail) return { status: 'passed' };

  const scenario = failureScenarios[Math.floor(Math.random() * failureScenarios.length)];
  return { status: 'failed', ...scenario, originalSelector: testCase.selector };
}

function createTestCases(runId, templates, jiraIssues) {
  return templates.map((tmpl) => {
    // Prefer explicit jiraIssueKey on the template (set when building from Jira)
    let jiraIssueKey = tmpl.jiraIssueKey || null;
    let jiraUrl = tmpl.jiraUrl || null;
    if (!jiraIssueKey && jiraIssues.length > 0) {
      const jiraIssue = jiraIssues.find((j) => j.summary?.toLowerCase().includes(tmpl.module?.toLowerCase()));
      jiraIssueKey = jiraIssue?.key || null;
      jiraUrl = jiraIssue?.url || null;
    }
    return {
      id: uuidv4(),
      runId,
      name: tmpl.name,
      module: tmpl.module,
      description: tmpl.description,
      selector: tmpl.selector,
      filePath: tmpl.filePath,
      failureProbability: tmpl.failureProbability || 0.2,
      jiraIssueKey,
      jiraUrl,
      critical: tmpl.critical || false,
    };
  });
}

// ─── Jira-driven test case generation ─────────────────────────────────────────

function deriveModuleFromIssue(issue) {
  const text = `${issue.summary || ''} ${issue.description || ''}`.toLowerCase();
  if (text.includes('login') || text.includes('auth') || text.includes('password') || text.includes('credential') || text.includes('logout') || text.includes('account')) return 'auth';
  if (text.includes('cart') || text.includes('checkout') || text.includes('purchase') || text.includes('order') || text.includes('buy') || text.includes('payment')) return 'checkout';
  if (text.includes('product') || text.includes('inventory') || text.includes('item') || text.includes('sort') || text.includes('filter') || text.includes('catalog')) return 'inventory';
  if (text.includes('dashboard') || text.includes('overview') || text.includes('summary') || text.includes('report')) return 'dashboard';
  if (text.includes('api') || text.includes('endpoint') || text.includes('rest') || text.includes('graphql') || text.includes('webhook')) return 'api';
  if (text.includes('database') || text.includes(' db ') || text.includes('crud') || text.includes('schema')) return 'database';
  if (text.includes('ui') || text.includes('button') || text.includes('form') || text.includes('page') || text.includes('navigation') || text.includes('modal') || text.includes('widget')) return 'ui';
  if (text.includes('notification') || text.includes('slack') || text.includes('email') || text.includes('alert')) return 'services';
  if (issue.issue_type === 'Bug' || issue.type === 'Bug') return 'regression';
  return 'integration';
}

function deriveSelectorFromModule(module) {
  const selectors = {
    auth: '#login-form',
    checkout: '[data-test="checkout-button"]',
    inventory: '[data-test="inventory-container"]',
    dashboard: '.dashboard-container',
    api: null,
    database: null,
    ui: '[data-test="app-container"]',
    services: null,
    regression: null,
    integration: null,
  };
  return selectors[module] || null;
}

function buildJiraTestCases(jiraIssues) {
  const config = require('../config/config');
  return jiraIssues.map((issue) => {
    const module = deriveModuleFromIssue(issue);
    const priority = issue.priority || 'Medium';
    // DB rows use `type`; mapped objects (from jira.service) may also use `type`
    const type = issue.type || issue.issue_type || 'Story';
    const failureProbability =
      type === 'Bug' ? 0.6 :
      priority === 'Highest' || priority === 'High' ? 0.4 :
      priority === 'Medium' ? 0.25 : 0.15;

    // URL is not stored in DB — compute from key
    const jiraUrl = issue.url || (issue.key ? `${config.jira.baseUrl}/browse/${issue.key}` : null);

    return {
      name: `[${issue.key}] ${issue.summary}`,
      module,
      description: issue.description || `Verify: ${issue.summary}`,
      selector: deriveSelectorFromModule(module),
      filePath: `tests/${module}/${(issue.key || 'test').toLowerCase().replace('-', '_')}.spec.js`,
      failureProbability,
      jiraIssueKey: issue.key,
      jiraUrl,
      critical: priority === 'Highest' || priority === 'High' || type === 'Bug',
    };
  });
}

function generateFullRegressionTests() {
  return [
    ...generateAuthTests(), ...generateDashboardTests(), ...generateApiTests(),
    ...generateUITests(), ...generateDatabaseTests(), ...generateIntegrationTests(),
  ];
}

function generateAuthTests() {
  return [
    { name: 'TC-001: User Login with Valid Credentials', module: 'auth', description: 'Verify user can login', selector: '#login-btn', filePath: 'tests/auth/login.spec.js', failureProbability: 0.15 },
    { name: 'TC-002: User Login with Invalid Credentials', module: 'auth', description: 'Verify error on invalid login', selector: '.error-message', filePath: 'tests/auth/login.spec.js', failureProbability: 0.1 },
    { name: 'TC-003: User Registration Flow', module: 'auth', description: 'Verify user registration', selector: '#register-form', filePath: 'tests/auth/register.spec.js', failureProbability: 0.2 },
    { name: 'TC-004: Password Reset Email', module: 'auth', description: 'Verify password reset email is sent', selector: '.reset-email-input', filePath: 'tests/auth/password.spec.js', failureProbability: 0.25 },
    { name: 'TC-005: JWT Token Validation', module: 'auth', description: 'Verify JWT token is valid', selector: null, filePath: 'tests/auth/token.spec.js', failureProbability: 0.12 },
  ];
}

function generateSmokeTests() {
  return [
    { name: 'TC-S01: Application Loads', module: 'ui', description: 'App loads without error', selector: '.app-container', filePath: 'tests/smoke/app.spec.js', failureProbability: 0.05, critical: true },
    { name: 'TC-S02: Main Navigation Works', module: 'ui', description: 'Navigation links work', selector: 'nav a', filePath: 'tests/smoke/nav.spec.js', failureProbability: 0.1, critical: true },
    { name: 'TC-S03: API Health Check', module: 'api', description: 'API returns 200', selector: null, filePath: 'tests/smoke/api.spec.js', failureProbability: 0.08, critical: true },
  ];
}

function generateApiTests() {
  return [
    { name: 'TC-A01: GET /api/users returns 200', module: 'api', description: 'Users endpoint works', selector: null, filePath: 'tests/api/users.spec.js', failureProbability: 0.18 },
    { name: 'TC-A02: POST /api/users creates user', module: 'api', description: 'User creation API', selector: null, filePath: 'tests/api/users.spec.js', failureProbability: 0.22 },
    { name: 'TC-A03: GET /api/projects returns list', module: 'api', description: 'Projects list API', selector: null, filePath: 'tests/api/projects.spec.js', failureProbability: 0.15 },
    { name: 'TC-A04: POST /api/test-runs creates run', module: 'api', description: 'Test run creation', selector: null, filePath: 'tests/api/testruns.spec.js', failureProbability: 0.2 },
    { name: 'TC-A05: DELETE /api/runs/:id deletes run', module: 'api', description: 'Run deletion API', selector: null, filePath: 'tests/api/testruns.spec.js', failureProbability: 0.1 },
    { name: 'TC-A06: Jira API Integration', module: 'api', description: 'Jira fetch works', selector: null, filePath: 'tests/api/jira.spec.js', failureProbability: 0.3 },
    { name: 'TC-A07: GitHub API Integration', module: 'api', description: 'GitHub fetch works', selector: null, filePath: 'tests/api/github.spec.js', failureProbability: 0.25 },
  ];
}

function generateUITests() {
  return [
    { name: 'TC-U01: Dashboard Overview Renders', module: 'ui', description: 'Dashboard page loads', selector: '.dashboard-container', filePath: 'tests/ui/dashboard.spec.js', failureProbability: 0.15 },
    { name: 'TC-U02: Test Run History Table', module: 'ui', description: 'Runs table renders', selector: '.runs-table', filePath: 'tests/ui/runs.spec.js', failureProbability: 0.2 },
    { name: 'TC-U03: Run Detail Page Navigation', module: 'ui', description: 'Run detail page opens', selector: '.run-detail', filePath: 'tests/ui/rundetail.spec.js', failureProbability: 0.18 },
    { name: 'TC-U04: Analytics Charts Render', module: 'ui', description: 'Charts load correctly', selector: '.chart-container', filePath: 'tests/ui/analytics.spec.js', failureProbability: 0.22 },
    { name: 'TC-U05: Trigger Test Run Button', module: 'ui', description: 'Test run can be triggered from UI', selector: '#trigger-run-btn', filePath: 'tests/ui/triggers.spec.js', failureProbability: 0.2 },
  ];
}

function generateDashboardTests() {
  return [
    { name: 'TC-D01: Stats Cards Load Correctly', module: 'dashboard', description: 'All stat cards visible', selector: '.stat-card', filePath: 'tests/dashboard/stats.spec.js', failureProbability: 0.12 },
    { name: 'TC-D02: Recent Activity Feed', module: 'dashboard', description: 'Activity feed renders', selector: '.activity-feed', filePath: 'tests/dashboard/activity.spec.js', failureProbability: 0.18 },
    { name: 'TC-D03: Jira Issues Widget', module: 'dashboard', description: 'Jira widget loads', selector: '.jira-widget', filePath: 'tests/dashboard/jira.spec.js', failureProbability: 0.28 },
    { name: 'TC-D04: GitHub PRs Widget', module: 'dashboard', description: 'GitHub widget loads', selector: '.github-widget', filePath: 'tests/dashboard/github.spec.js', failureProbability: 0.25 },
  ];
}

function generateDatabaseTests() {
  return [
    { name: 'TC-DB01: Database Connection Pool', module: 'database', description: 'DB connection works', selector: null, filePath: 'tests/database/connection.spec.js', failureProbability: 0.1 },
    { name: 'TC-DB02: Test Runs CRUD Operations', module: 'database', description: 'CRUD on test_runs table', selector: null, filePath: 'tests/database/testruns.spec.js', failureProbability: 0.15 },
    { name: 'TC-DB03: Test Cases Insert/Query', module: 'database', description: 'Test cases persistence', selector: null, filePath: 'tests/database/testcases.spec.js', failureProbability: 0.12 },
  ];
}

function generateIntegrationTests() {
  return [
    { name: 'TC-I01: Jira-TestCase Sync', module: 'services', description: 'Jira issues sync to test cases', selector: null, filePath: 'tests/integration/jira-sync.spec.js', failureProbability: 0.3 },
    { name: 'TC-I02: GitHub PR Triggers Selective Run', module: 'services', description: 'PR change triggers right tests', selector: null, filePath: 'tests/integration/github-trigger.spec.js', failureProbability: 0.25 },
    { name: 'TC-I03: AI Healing Cycle E2E', module: 'services', description: 'Full healing cycle works', selector: null, filePath: 'tests/integration/healing.spec.js', failureProbability: 0.2 },
    { name: 'TC-I04: Report Generation', module: 'services', description: 'Reports generated and stored', selector: null, filePath: 'tests/integration/reports.spec.js', failureProbability: 0.15 },
    { name: 'TC-I05: Slack Notification on Failure', module: 'services', description: 'Slack notified on run failure', selector: null, filePath: 'tests/integration/slack.spec.js', failureProbability: 0.2 },
  ];
}

function getFailureScenarios() {
  return [
    { errorMessage: "ElementNotFound: Unable to locate element with selector '#submit-btn'", stackTrace: "at WebDriver.findElement (selenium/lib/webdriver.js:123)\nat LoginPage.clickSubmit (pages/login.page.js:45)\nat LoginTest.test (tests/auth/login.spec.js:23)", originalSelector: '#submit-btn' },
    { errorMessage: 'AssertionError: Expected 200 but received 404 - GET /api/v2/users', stackTrace: 'at assert.equal (assert.js:89)\nat ApiTest.testUsersEndpoint (tests/api/users.spec.js:12)', originalSelector: null },
    { errorMessage: "TimeoutError: Waiting for element '.loading-spinner' to disappear timed out after 10000ms", stackTrace: 'at Page.waitForElement (lib/page.js:67)\nat DashboardTest (tests/ui/dashboard.spec.js:34)', originalSelector: '.loading-spinner' },
    { errorMessage: 'StaleElementReferenceException: Element is no longer attached to the DOM - .nav-link[href="/dashboard"]', stackTrace: 'at NavigationTest (tests/ui/nav.spec.js:19)', originalSelector: '.nav-link[href="/dashboard"]' },
    { errorMessage: 'DataError: Expected test user "testuser@example.com" not found in database', stackTrace: 'at UserDataHelper.getTestUser (helpers/data.js:34)\nat AuthTest (tests/auth/login.spec.js:56)', originalSelector: null },
    { errorMessage: 'ConnectionError: ECONNREFUSED - connect ECONNREFUSED 127.0.0.1:5432', stackTrace: 'at DatabaseService.connect (services/database.js:23)\nat TestSetup (tests/database/connection.spec.js:8)', originalSelector: null },
    { errorMessage: "AssertionError: Text mismatch - expected 'Welcome, User!' but got 'Welcome, !'", stackTrace: 'at DashboardTest.checkWelcomeMessage (tests/ui/dashboard.spec.js:67)', originalSelector: '.welcome-text' },
    { errorMessage: 'SchemaValidationError: Response missing required field "userId" in POST /api/auth/login', stackTrace: 'at ApiSchemaValidator (tests/api/auth.spec.js:89)', originalSelector: null },
  ];
}

async function getRunById(runId) {
  const db = getDatabase();
  const run = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(runId);
  if (!run) return null;

  // Enrich test cases with Jira data from jira_issues table (no url column — compute it)
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

module.exports = { startTestRun, getRunById, getAllRuns, getTestStats };
