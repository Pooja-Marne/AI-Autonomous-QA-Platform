const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getDatabase } = require('../config/database');
const config = require('../config/config');

const TESTS_DIR = config.automation.repoPath;
const RESOLVED_CACHE_PATH = path.join(TESTS_DIR, 'playwright', 'locators', 'resolved-locators.json');

// Identifies which build of the app is currently running — Railway sets
// this automatically on every deploy; falls back to reading git HEAD
// directly for local dev, where that env var isn't present.
function getCurrentAppVersion() {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) return process.env.RAILWAY_GIT_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { cwd: __dirname, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// Runs once at backend startup and again at the start of every test run
// (cheap: one row read + a string compare) — if the app's version has
// changed since the last time we healed anything (a new deployment, a
// merged PR, or any other code change), every currently-active locator fix
// is superseded: it was verified against a DIFFERENT version of the code
// and/or site, and carrying it forward silently is exactly what let a
// stale fix resurface. Only a genuine version change invalidates anything —
// an ordinary restart on the SAME build leaves valid healing state intact.
function checkAndInvalidateOnVersionChange() {
  const db = getDatabase();
  const currentVersion = getCurrentAppVersion();
  const row = db.prepare('SELECT last_known_version FROM app_version_state WHERE id = 1').get();
  const lastKnownVersion = row?.last_known_version || null;
  const cacheLoaded = fs.existsSync(RESOLVED_CACHE_PATH);
  const changed = lastKnownVersion !== null && lastKnownVersion !== currentVersion;

  console.log('[LocatorCache] Cache Loaded:', cacheLoaded ? 'YES' : 'NO');
  console.log('[LocatorCache] Cache Version:', lastKnownVersion || '(none recorded yet)');
  console.log('[LocatorCache] Current Application Version:', currentVersion);
  console.log('[LocatorCache] Cache Invalidated:', changed ? 'YES' : 'NO');
  console.log('[LocatorCache] Reason:', changed
    ? 'Application version changed since last healing — all active locator fixes were verified against a different build and are now superseded.'
    : (lastKnownVersion === null ? 'First run — no prior version recorded.' : 'Same application version — existing healed locators remain valid.'));

  if (changed) {
    const { resolvedCount, supersededCount } = reconcileLocatorRepositoryAgainstSource();
    console.log(`[LocatorCache] Reconciled active locators against current source: ${resolvedCount} resolved (fix confirmed in source), ${supersededCount} superseded (fix not found in source).`);
  }

  db.prepare(`
    INSERT INTO app_version_state (id, last_known_version, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET last_known_version = excluded.last_known_version, updated_at = CURRENT_TIMESTAMP
  `).run(currentVersion);

  return { changed, currentVersion, lastKnownVersion };
}

// Regenerates the JSON file every Page Object's resolve() call reads at
// construction time. This is THE mechanism that makes terminal execution,
// the dashboard, Jira-triggered runs, and the scheduler all resolve
// identically — they all read this exact file, not a per-process cache or
// an in-memory map that only the backend that healed it knows about.
//
// A row is "active" only if it is BOTH pending_approval/approved AND the
// ABSOLUTE latest version for that page_object+property — not just the
// latest among approved rows. Without that second condition, once version N
// gets approved, a LATER version N+1 getting rejected (because the site
// changed again and that attempt's retry failed) would silently fall back
// to serving the stale, already-superseded version N forever — exactly the
// bug that let an old 98%-confidence fix keep resolving even though two
// newer healing cycles had since proven it no longer matches the live site.
// If the absolute-latest version is rejected, NO row is served — resolution
// correctly reverts to the Page Object's hardcoded default until a fresh
// healing cycle re-verifies a working fix.
function syncRuntimeCache() {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT lr.* FROM locator_repository lr
    WHERE lr.status IN ('pending_approval', 'approved')
      AND lr.version = (
        SELECT MAX(version) FROM locator_repository lr2
        WHERE lr2.page_object = lr.page_object AND lr2.property_name = lr.property_name
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

// The single place that ever flips a row to 'resolved' — checks whether the
// CURRENT checked-out Page Object source already contains this exact healed
// value. If so, the fix has been merged/deployed and is now permanently part
// of source: mark it resolved (excluding it from the runtime cache via the
// status filter above) so it stops being suggested/served, while keeping the
// row itself for audit history. Returns false (no-op) if source doesn't
// match yet — the row stays active.
function resolveIfSourceMatches(row, reason) {
  const { getCurrentLocatorFromSource } = require('./pageObjectSource.service');
  const currentValue = getCurrentLocatorFromSource(row.page_object, row.property_name);
  if (currentValue !== row.healed_locator) return false;

  const db = getDatabase();
  db.prepare(`
    UPDATE locator_repository SET status = 'resolved', resolution_reason = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(reason, row.id);
  syncRuntimeCache();
  return true;
}

// Per-row replacement for the old blanket "supersede everything active"
// behavior: each active row is checked against what its OWN specific
// page_object+property currently resolves to in source. Only a row whose
// fix isn't (yet) confirmed in source gets superseded — a row whose fix IS
// confirmed gets marked resolved instead of being wrongly treated as stale
// just because some unrelated commit landed.
function reconcileLocatorRepositoryAgainstSource() {
  const db = getDatabase();
  const activeRows = db.prepare(`SELECT * FROM locator_repository WHERE status IN ('pending_approval', 'approved')`).all();
  let resolvedCount = 0;
  let supersededCount = 0;
  for (const row of activeRows) {
    if (resolveIfSourceMatches(row, 'source_confirmed_on_deploy')) {
      resolvedCount++;
    } else {
      db.prepare(`UPDATE locator_repository SET status = 'superseded_by_deploy' WHERE id = ?`).run(row.id);
      supersededCount++;
    }
  }
  if (resolvedCount || supersededCount) syncRuntimeCache();
  return { resolvedCount, supersededCount };
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

// Latest still-active (unresolved) row for a given page_object+property —
// used by the pre-healing check (is there already an in-flight/approved fix
// for this exact locator?) and the GitHub merge poller.
function findActiveLocatorRepositoryRow(pageObject, propertyName) {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM locator_repository WHERE page_object = ? AND property_name = ?
      AND status IN ('pending_approval', 'approved') ORDER BY version DESC LIMIT 1
  `).get(pageObject, propertyName) || null;
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
// the dashboard's "Active Healing" list — only unresolved locators (still
// pending_approval or approved, i.e. not yet confirmed merged into source,
// not rejected). Resolved/rejected/superseded history lives in
// listResolvedLocators() below, kept out of this list so a merged fix stops
// being shown as if it were still pending.
function listActiveLocators() {
  const db = getDatabase();
  const latest = db.prepare(`
    SELECT lr.* FROM locator_repository lr
    WHERE lr.status IN ('pending_approval', 'approved')
      AND lr.version = (
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

// Mirror of listActiveLocators for terminal-state rows — the dashboard's
// audit-trail "Resolved / History" section.
function listResolvedLocators() {
  const db = getDatabase();
  const latest = db.prepare(`
    SELECT lr.* FROM locator_repository lr
    WHERE lr.status IN ('resolved', 'rejected', 'superseded_by_deploy')
      AND lr.version = (
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
    return updateGitStatus(id, {
      gitStatus: 'pr_open', commitSha: gitResult.commitSha, prUrl: gitResult.prUrl, prNumber: gitResult.prNumber,
    });
  }
  db.prepare(`UPDATE locator_repository SET git_status = 'failed' WHERE id = ?`).run(id);
  return { ...getLocatorById(id), gitError: gitResult.reason };
}

// Approves and opens ONE PR for a whole batch of locators at once — used
// when a regression run heals more than one locator, so they don't each
// get their own separate (and potentially conflicting, see PR #5/#6
// history) PR. Marks every row approved first (same as single-approve),
// then hands the whole batch to createBatchLocatorFixPR; whatever actually
// made it into the resulting commit gets git_status='pr_open' sharing the
// same PR/commit, and anything that couldn't be applied gets 'failed'
// individually rather than failing the entire batch.
async function approveLocatorsBatch(ids, { approvedBy = 'dashboard-user' } = {}) {
  const db = getDatabase();
  const rows = ids.map(getLocatorById).filter(Boolean);
  for (const r of rows) {
    db.prepare(`
      UPDATE locator_repository SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = ?
      WHERE id = ?
    `).run(approvedBy, r.id);
  }
  syncRuntimeCache();

  const { createBatchLocatorFixPR } = require('./gitIntegration.service');
  const result = await createBatchLocatorFixPR(rows.map((r) => ({
    id: r.id, pageObject: r.page_object, propertyName: r.property_name,
    originalLocator: r.original_locator, healedLocator: r.healed_locator,
    confidenceScore: r.confidence_score, healingReason: r.healing_reason,
  })));

  for (const inc of result.included) {
    updateGitStatus(inc.id, { gitStatus: 'pr_open', commitSha: result.commitSha, prUrl: result.prUrl, prNumber: result.prNumber });
  }
  for (const sk of result.skipped) {
    db.prepare(`UPDATE locator_repository SET git_status = 'failed' WHERE id = ?`).run(sk.id);
  }

  return {
    ...result,
    locators: rows.map((r) => getLocatorById(r.id)), // fresh state for every row touched, for the dashboard to re-render from
  };
}

function updateGitStatus(id, { gitStatus, commitSha, prUrl, prNumber }) {
  const db = getDatabase();
  db.prepare(`
    UPDATE locator_repository SET git_status = ?, git_commit_sha = COALESCE(?, git_commit_sha),
      git_pr_url = COALESCE(?, git_pr_url), pr_number = COALESCE(?, pr_number)
    WHERE id = ?
  `).run(gitStatus, commitSha ?? null, prUrl ?? null, prNumber ?? null, id);
  return getLocatorById(id);
}

module.exports = {
  recordHealedLocator, rejectLocator, approveLocator, approveLocatorsBatch, updateGitStatus,
  getLocatorById, listActiveLocators, listResolvedLocators, syncRuntimeCache, RESOLVED_CACHE_PATH,
  deleteLocator, clearAllLocators, checkAndInvalidateOnVersionChange, getCurrentAppVersion,
  findActiveLocatorRepositoryRow, resolveIfSourceMatches, reconcileLocatorRepositoryAgainstSource,
};
