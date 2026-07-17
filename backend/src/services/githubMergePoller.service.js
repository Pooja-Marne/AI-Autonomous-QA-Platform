const cron = require('node-cron');
const { getDatabase } = require('../config/database');
const { isConfigured, getPullRequest } = require('./gitIntegration.service');

// Demo-friendly interval — the dashboard should visibly flip from "PR Open"
// to "Resolved" within a few seconds of merging, not on the next 5-minute
// tick. GitHub's REST API rate limit (5000 req/hr for an authenticated
// token) has plenty of headroom for polling this often against a handful
// of open PRs. Configurable via GITHUB_MERGE_POLL_INTERVAL if a slower/
// cheaper cadence is ever wanted again outside of demos.
const POLL_INTERVAL = process.env.GITHUB_MERGE_POLL_INTERVAL || '*/15 * * * * *';

let pollerJob = null;
let consecutiveFailures = 0;
// GitHub API blips are common background noise (unlike Jira's auth/schema
// errors, which are usually a real, persistent misconfiguration) — allow a
// few failed ticks before giving up on auto-polling.
const MAX_FAILURES = 3;

// Checks every PR still marked 'pr_open' against GitHub's actual current
// state. A merge alone does NOT flip the repository row's `status` to
// resolved — `resolveIfSourceMatches` is what actually confirms the fix
// landed in the source this backend/tests run against, since a PR can merge
// before the corresponding deploy reaches this environment. This poller's
// job is purely to surface "PR Merged" on the dashboard quickly; the
// authoritative resolution still requires a source-content match (also
// re-checked on every deploy via checkAndInvalidateOnVersionChange).
async function pollForMergedPRs() {
  if (!isConfigured()) return { checked: 0 };

  const db = getDatabase();
  const { updateGitStatus, resolveIfSourceMatches } = require('./locatorRepository.service');
  const openRows = db.prepare(
    `SELECT * FROM locator_repository WHERE git_status = 'pr_open' AND pr_number IS NOT NULL`
  ).all();

  let merged = 0;
  let closed = 0;
  try {
    for (const row of openRows) {
      const pr = await getPullRequest(row.pr_number);
      if (pr.merged) {
        updateGitStatus(row.id, { gitStatus: 'pr_merged', commitSha: pr.mergeCommitSha });
        resolveIfSourceMatches(row, 'pr_merged_source_confirmed');
        merged++;
      } else if (pr.state === 'closed') {
        updateGitStatus(row.id, { gitStatus: 'pr_closed_unmerged' });
        closed++;
      }
    }
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures++;
    console.error('[GithubMergePoller] Poll error:', err.message);
    if (consecutiveFailures >= MAX_FAILURES && pollerJob) {
      pollerJob.stop();
      pollerJob = null;
      console.warn('[GithubMergePoller] Auto-polling stopped after repeated failures.');
    }
  }
  return { checked: openRows.length, merged, closed };
}

function initializeGithubMergePoller() {
  if (!isConfigured()) {
    console.log('[GithubMergePoller] GITHUB_TOKEN/GITHUB_REPO not configured — poller not started');
    return;
  }
  if (pollerJob) pollerJob.stop();
  pollerJob = cron.schedule(POLL_INTERVAL, pollForMergedPRs);
  console.log(`[GithubMergePoller] Polling for merged PRs on schedule: ${POLL_INTERVAL}`);
  pollForMergedPRs();
}

function stopPoller() {
  if (pollerJob) { pollerJob.stop(); pollerJob = null; }
}

module.exports = { initializeGithubMergePoller, stopPoller, pollForMergedPRs };
