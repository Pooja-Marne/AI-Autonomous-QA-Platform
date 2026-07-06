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

    -- GitHub PRs / Commits Cache
    CREATE TABLE IF NOT EXISTS git_changes (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      sha TEXT,
      branch TEXT,
      title TEXT,
      author TEXT,
      message TEXT,
      files_changed TEXT,
      impacted_modules TEXT,
      url TEXT,
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

  console.log('[DB] Schema initialized successfully');
}

module.exports = { getDatabase };
