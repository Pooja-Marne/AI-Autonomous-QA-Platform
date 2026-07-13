const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../config/database');
const config = require('../config/config');

const TESTS_DIR = config.automation.repoPath;
const RESOLVED_CACHE_PATH = path.join(TESTS_DIR, 'playwright', 'locators', 'resolved-locators.json');

// Regenerates the JSON file every Page Object's resolve() call reads at
// construction time. This is THE mechanism that makes terminal execution,
// the dashboard, Jira-triggered runs, and the scheduler all resolve
// identically — they all read this exact file, not a per-process cache or
// an in-memory map that only the backend that healed it knows about.
// Only pending_approval/approved rows are "active" (usable at runtime);
// rejected/superseded rows are excluded, so rejecting a fix immediately
// reverts resolution back to the Page Object's hardcoded default.
function syncRuntimeCache() {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT lr.* FROM locator_repository lr
    WHERE lr.status IN ('pending_approval', 'approved')
      AND lr.version = (
        SELECT MAX(version) FROM locator_repository lr2
        WHERE lr2.page_object = lr.page_object AND lr2.property_name = lr.property_name
          AND lr2.status IN ('pending_approval', 'approved')
      )
  `).all();

  const cache = {};
  for (const row of rows) {
    cache[`${row.page_object}.${row.property_name}`] = {
      locator: row.healed_locator,
      status: row.status,
      confidence: row.confidence_score,
      id: row.id,
      version: row.version,
      healedAt: row.created_at,
    };
  }

  fs.mkdirSync(path.dirname(RESOLVED_CACHE_PATH), { recursive: true });
  fs.writeFileSync(RESOLVED_CACHE_PATH, JSON.stringify(cache, null, 2));
  return cache;
}

// Records a new healing event. Always creates a NEW row (never overwrites) —
// version = how many times this exact page_object+property has been healed,
// giving full history for free. Immediately syncs the runtime cache so the
// very next test execution (any path) picks it up.
function recordHealedLocator({
  pageObject, propertyName, originalLocator, healedLocator, confidenceScore,
  healingReason, testName, module, runId, demoHealingRunId, liveVerified,
}) {
  const db = getDatabase();
  const prevVersion = db.prepare(
    `SELECT MAX(version) as v FROM locator_repository WHERE page_object = ? AND property_name = ?`
  ).get(pageObject, propertyName)?.v || 0;

  const id = uuidv4();
  db.prepare(`
    INSERT INTO locator_repository (
      id, page_object, property_name, version, original_locator, healed_locator,
      confidence_score, healing_reason, test_name, module, run_id, demo_healing_run_id,
      live_verified, status, git_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_approval', 'not_started')
  `).run(
    id, pageObject, propertyName, prevVersion + 1, originalLocator, healedLocator,
    confidenceScore ?? null, healingReason ?? null, testName ?? null, module ?? null,
    runId ?? null, demoHealingRunId ?? null, liveVerified ? 1 : 0
  );

  syncRuntimeCache();
  return getLocatorById(id);
}

// Retry failed after using this cache entry — the fix wasn't actually valid
// in practice, so pull it out of rotation immediately rather than let every
// subsequent run keep hitting the same broken "healed" locator.
function rejectLocator(id) {
  const db = getDatabase();
  db.prepare(`UPDATE locator_repository SET status = 'rejected' WHERE id = ?`).run(id);
  syncRuntimeCache();
  return getLocatorById(id);
}

function getLocatorById(id) {
  const db = getDatabase();
  return db.prepare(`SELECT * FROM locator_repository WHERE id = ?`).get(id) || null;
}

// Hard-deletes one row (unlike reject, which just changes status and keeps
// history) — for pruning a single bad/test entry without wiping everything.
function deleteLocator(id) {
  const db = getDatabase();
  const existing = getLocatorById(id);
  if (!existing) return null;
  db.prepare(`DELETE FROM locator_repository WHERE id = ?`).run(id);
  syncRuntimeCache();
  return existing;
}

// Wipes the entire repository — used by both DELETE /clear and POST /reset
// (kept as one function since they're the same operation under two names)
// to get back to a clean slate before a demo, e.g. after chaos runs pile up
// pending_approval rows.
function clearAllLocators() {
  const db = getDatabase();
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM locator_repository`).get();
  db.prepare(`DELETE FROM locator_repository`).run();
  syncRuntimeCache();
  return { cleared: count };
}

// One row per page_object+property, showing only the latest version, for
// the dashboard's summary list — with the full version history attached.
function listActiveLocators() {
  const db = getDatabase();
  const latest = db.prepare(`
    SELECT lr.* FROM locator_repository lr
    WHERE lr.version = (
      SELECT MAX(version) FROM locator_repository lr2
      WHERE lr2.page_object = lr.page_object AND lr2.property_name = lr.property_name
    )
    ORDER BY lr.created_at DESC
  `).all();

  return latest.map((row) => ({
    ...row,
    history: db.prepare(
      `SELECT * FROM locator_repository WHERE page_object = ? AND property_name = ? ORDER BY version DESC`
    ).all(row.page_object, row.property_name),
  }));
}

// Approval has two effects, deliberately separate: (1) mark the row
// approved (cosmetic/audit — it was already active at runtime as
// pending_approval), and (2) attempt to open a real PR against source via
// gitIntegration.service.js. Git failing/not-being-configured never blocks
// approval — the fix stays live either way; git_status just reflects
// whether the source-code side of it actually happened.
async function approveLocator(id, { approvedBy = 'dashboard-user' } = {}) {
  const db = getDatabase();
  db.prepare(`
    UPDATE locator_repository SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?
    WHERE id = ?
  `).run(approvedBy, id);
  syncRuntimeCache();

  const row = getLocatorById(id);
  const { createLocatorFixPR } = require('./gitIntegration.service');
  const gitResult = await createLocatorFixPR({
    pageObject: row.page_object, propertyName: row.property_name,
    originalLocator: row.original_locator, healedLocator: row.healed_locator,
    confidenceScore: row.confidence_score, healingReason: row.healing_reason,
  });

  if (gitResult.success) {
    return updateGitStatus(id, { gitStatus: 'pr_open', commitSha: gitResult.commitSha, prUrl: gitResult.prUrl });
  }
  db.prepare(`UPDATE locator_repository SET git_status = 'failed' WHERE id = ?`).run(id);
  return { ...getLocatorById(id), gitError: gitResult.reason };
}

function updateGitStatus(id, { gitStatus, commitSha, prUrl }) {
  const db = getDatabase();
  db.prepare(`
    UPDATE locator_repository SET git_status = ?, git_commit_sha = COALESCE(?, git_commit_sha), git_pr_url = COALESCE(?, git_pr_url)
    WHERE id = ?
  `).run(gitStatus, commitSha ?? null, prUrl ?? null, id);
  return getLocatorById(id);
}

module.exports = {
  recordHealedLocator, rejectLocator, approveLocator, updateGitStatus,
  getLocatorById, listActiveLocators, syncRuntimeCache, RESOLVED_CACHE_PATH,
  deleteLocator, clearAllLocators,
};
