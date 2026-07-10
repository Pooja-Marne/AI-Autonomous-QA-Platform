const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const config = require('./config');

let db;

function getDatabase() {
  if (!db) {
    const dbPath = path.resolve(config.database.path);
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db) {
  db.exec(`
    -- Test Runs
    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      trigger_type TEXT DEFAULT 'manual',
      branch TEXT,
      commit_sha TEXT,
      jira_sprint TEXT,
      total_tests INTEGER DEFAULT 0,
      passed INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      healed INTEGER DEFAULT 0,
      skipped INTEGER DEFAULT 0,
      not_fixable INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Test Cases
    CREATE TABLE IF NOT EXISTS test_cases (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      name TEXT NOT NULL,
      module TEXT,
      description TEXT,
      status TEXT DEFAULT 'pending',
      failure_type TEXT,
      error_message TEXT,
      stack_trace TEXT,
      healing_status TEXT,
      healing_action TEXT,
      healing_suggestion TEXT,
      original_selector TEXT,
      healed_selector TEXT,
      retry_count INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      jira_issue_key TEXT,
      git_commit TEXT,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES test_runs(id)
    );

    -- Healing Actions Log
    CREATE TABLE IF NOT EXISTS healing_actions (
      id TEXT PRIMARY KEY,
      test_case_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      failure_type TEXT,
      original_error TEXT,
      ai_analysis TEXT,
      suggested_fix TEXT,
      fix_applied TEXT,
      success INTEGER DEFAULT 0,
      confidence_score REAL DEFAULT 0,
      model_used TEXT,
      tokens_used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id)
    );

    -- Live "real" AI healing cycles triggered by the two DEMO_MODE-controlled
    -- broken locators (see tests/playwright/demo/). Separate from
    -- healing_actions because this captures a richer, presentation-oriented
    -- record: real screenshot/trace/DOM artifacts, live-verified locator,
    -- and a step-by-step log trail for the demo audience to follow.
    CREATE TABLE IF NOT EXISTS demo_healing_runs (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      locator_key TEXT NOT NULL,
      test_file TEXT,
      failed_tests TEXT,
      old_locator TEXT,
      new_locator TEXT,
      root_cause TEXT,
      confidence_score REAL,
      live_verified INTEGER DEFAULT 0,
      healing_status TEXT,
      retry_status TEXT,
      screenshot_path TEXT,
      trace_path TEXT,
      dom_snapshot_path TEXT,
      time_taken_ms INTEGER,
      logs TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Centralized Locator Repository — the single source of truth for every
    -- healed locator, across ALL execution paths (terminal, dashboard, Jira
    -- trigger, scheduler). One row per healing event; page_object+property
    -- can have many rows over time (version = row count for that pair), so
    -- history/versioning falls out of the schema for free. The most recent
    -- non-rejected row for a page_object+property is "active" and is what
    -- gets synced into the runtime JSON cache every Page Object reads from —
    -- see backend/src/services/locatorRepository.service.js.
    CREATE TABLE IF NOT EXISTS locator_repository (
      id TEXT PRIMARY KEY,
      page_object TEXT NOT NULL,
      property_name TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      original_locator TEXT NOT NULL,
      healed_locator TEXT NOT NULL,
      confidence_score REAL,
      healing_reason TEXT,
      test_name TEXT,
      module TEXT,
      run_id TEXT,
      demo_healing_run_id TEXT,
      live_verified INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending_approval', -- pending_approval | approved | rejected | superseded
      git_status TEXT DEFAULT 'not_started',            -- not_started | committed | pr_open | pr_merged | failed
      git_commit_sha TEXT,
      git_pr_url TEXT,
      approved_at DATETIME,
      approved_by TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Jira Issues Cache
    CREATE TABLE IF NOT EXISTS jira_issues (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      summary TEXT,
      type TEXT,
      status TEXT,
      priority TEXT,
      assignee TEXT,
      sprint TEXT,
      description TEXT,
      linked_test_case TEXT,
      fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Scheduler Config
    CREATE TABLE IF NOT EXISTS scheduler_config (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      test_suite TEXT,
      trigger_type TEXT DEFAULT 'scheduled',
      last_run DATETIME,
      next_run DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Pending Triggers (Jira story closed/bug fixed → awaiting user suite selection)
    CREATE TABLE IF NOT EXISTS pending_triggers (
      id TEXT PRIMARY KEY,
      jira_key TEXT NOT NULL,
      jira_summary TEXT,
      jira_type TEXT,
      jira_status TEXT,
      jira_priority TEXT,
      jira_assignee TEXT,
      jira_url TEXT,
      previous_status TEXT,
      event_type TEXT DEFAULT 'issue_resolved',
      user_decision TEXT,
      selected_suite TEXT,
      run_id TEXT,
      dismissed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      decided_at DATETIME
    );

    -- Reports
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      title TEXT,
      summary TEXT,
      healing_summary TEXT,
      jira_links TEXT,
      git_links TEXT,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (run_id) REFERENCES test_runs(id)
    );

    -- Coverage Intelligence Agent: per-issue analysis (Jira x Git x Automation x AI)
    CREATE TABLE IF NOT EXISTS coverage_analyses (
      id TEXT PRIMARY KEY,
      jira_key TEXT NOT NULL,
      jira_type TEXT,
      summary TEXT,
      description TEXT,
      acceptance_criteria TEXT,
      labels TEXT,
      components TEXT,
      linked_issues TEXT,
      sprint TEXT,
      fix_version TEXT,
      status TEXT,
      changed_modules TEXT,
      changed_apis TEXT,
      changed_ui_pages TEXT,
      changed_db_objects TEXT,
      commits TEXT,
      prs TEXT,
      authors TEXT,
      coverage_status TEXT,
      existing_test_cases TEXT,
      missing_test_cases TEXT,
      suggested_test_cases TEXT,
      automation_effort TEXT,
      automation_priority TEXT,
      automation_risk TEXT,
      recommended_regression_suites TEXT,
      regression_reason TEXT,
      release_risk TEXT,
      defect_risk TEXT,
      change_impact TEXT,
      confidence_score REAL,
      automation_coverage_pct REAL,
      ai_recommendations TEXT,
      overall_readiness TEXT,
      ai_generated INTEGER DEFAULT 0,
      analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Coverage Intelligence Agent: per-sprint rollup
    CREATE TABLE IF NOT EXISTS sprint_summaries (
      id TEXT PRIMARY KEY,
      sprint_name TEXT,
      stories_closed INTEGER DEFAULT 0,
      bugs_closed INTEGER DEFAULT 0,
      stories_with_automation INTEGER DEFAULT 0,
      stories_without_automation INTEGER DEFAULT 0,
      automation_coverage_pct REAL,
      recommended_new_test_cases TEXT,
      regression_suites_to_execute TEXT,
      high_risk_modules TEXT,
      release_readiness_score REAL,
      ai_recommendation TEXT,
      can_release TEXT,
      reason TEXT,
      generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Additive migration: pending_triggers predates the Coverage Intelligence Agent
  const pendingTriggerCols = db.prepare('PRAGMA table_info(pending_triggers)').all().map((c) => c.name);
  if (!pendingTriggerCols.includes('coverage_status')) {
    db.exec('ALTER TABLE pending_triggers ADD COLUMN coverage_status TEXT');
    db.exec('ALTER TABLE pending_triggers ADD COLUMN coverage_analysis_id TEXT');
    db.exec('ALTER TABLE pending_triggers ADD COLUMN recommended_suite TEXT');
    db.exec('ALTER TABLE pending_triggers ADD COLUMN coverage_summary TEXT');
  }

  // The automation repo is UI-only (SauceDemo) — no real 'api'/'ui' tagged
  // suite exists. Migrate any schedules seeded before this was known.
  db.exec(`UPDATE scheduler_config SET test_suite = 'regression' WHERE test_suite IN ('api', 'ui')`);

  // Additive migration: test_runs predates suite-scoped execution history
  // (the AI Healing page browsing "latest run for suite X").
  const testRunCols = db.prepare('PRAGMA table_info(test_runs)').all().map((c) => c.name);
  if (!testRunCols.includes('suite')) {
    db.exec('ALTER TABLE test_runs ADD COLUMN suite TEXT');
  }
  if (!testRunCols.includes('execution_logs')) {
    db.exec('ALTER TABLE test_runs ADD COLUMN execution_logs TEXT');
  }

  console.log('[DB] Schema initialized successfully');
}

module.exports = { getDatabase };
