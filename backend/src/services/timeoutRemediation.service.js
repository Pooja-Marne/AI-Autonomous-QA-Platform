const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../config/database');
const config = require('../config/config');
const { retryTest } = require('./demoHealingAgent.service');

const TESTS_DIR = config.automation.repoPath;
const TIMEOUT_CACHE_PATH = path.join(TESTS_DIR, 'playwright', 'fixtures', 'resolved-timeouts.json');

// Hard ceiling — once a test's own timeout is already at or past this, we
// refuse to attempt another bump at all. Without this, a genuinely
// worsening perf regression could get "healed" indefinitely, silently
// hiding a real problem instead of ever surfacing it to a human.
const MAX_TIMEOUT_MS = 60000;
const BUMP_MULTIPLIER = 2;

// Playwright always renders this exact message for both a test-body timeout
// and a hook timeout ("... while running \"beforeEach\" hook").
function extractOriginalTimeoutMs(errorMessage) {
  const match = (errorMessage || '').match(/Test timeout of (\d+)ms exceeded/i);
  return match ? parseInt(match[1], 10) : null;
}

// Regenerates the JSON file the healingTest.js fixture reads at the start
// of every test — same "one file every execution path reads" principle as
// locatorRepository.service.js's resolved-locators.json.
function syncTimeoutCache() {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT tr.* FROM timeout_remediations tr
    WHERE tr.status = 'active'
      AND tr.id = (
        SELECT id FROM timeout_remediations tr2
        WHERE tr2.test_key = tr.test_key
        ORDER BY created_at DESC LIMIT 1
      )
  `).all();

  const cache = {};
  for (const row of rows) {
    cache[row.test_key] = {
      bumpedTimeoutMs: row.bumped_timeout_ms,
      originalTimeoutMs: row.original_timeout_ms,
      reasoning: row.reasoning,
    };
  }

  fs.mkdirSync(path.dirname(TIMEOUT_CACHE_PATH), { recursive: true });
  fs.writeFileSync(TIMEOUT_CACHE_PATH, JSON.stringify(cache, null, 2));
  return cache;
}

function recordVerifiedTimeout({ testKey, testFile, originalMs, bumpedMs, runId, reasoning }) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO timeout_remediations (id, test_key, test_file, original_timeout_ms, bumped_timeout_ms, status, reasoning, run_id)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(uuidv4(), testKey, testFile ?? null, originalMs, bumpedMs, reasoning ?? null, runId ?? null);
  syncTimeoutCache();
}

// The core entry point, called only for failureType === 'timeout'. Attempts
// exactly ONE live-verified bump — never faked, never guessed: if the retry
// with the bumped timeout doesn't actually pass, nothing is recorded and the
// failure falls through to the normal, honest not_fixable diagnostic path.
async function attemptTimeoutRemediation({ testKey, testFile, errorMessage, runId }) {
  const originalMs = extractOriginalTimeoutMs(errorMessage);
  if (!originalMs || originalMs >= MAX_TIMEOUT_MS) {
    return { healed: false, reason: originalMs ? 'already at the timeout ceiling' : 'could not parse original timeout from error message' };
  }

  const bumpedMs = Math.min(originalMs * BUMP_MULTIPLIER, MAX_TIMEOUT_MS);
  const retry = await retryTest(testFile, testKey, { timeoutMs: bumpedMs });
  if (!retry.passed) {
    return { healed: false, reason: 'retry with bumped timeout still failed', bumpedMs };
  }

  const reasoning = `Live-verified: retrying with timeout bumped from ${originalMs}ms to ${bumpedMs}ms passed.`;
  recordVerifiedTimeout({ testKey, testFile, originalMs, bumpedMs, runId, reasoning });
  return { healed: true, originalMs, bumpedMs, reasoning };
}

module.exports = {
  attemptTimeoutRemediation, syncTimeoutCache, extractOriginalTimeoutMs,
  MAX_TIMEOUT_MS, BUMP_MULTIPLIER, TIMEOUT_CACHE_PATH,
};
