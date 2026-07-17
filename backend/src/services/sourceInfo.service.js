const { execSync } = require('child_process');
const fs = require('fs');
const { RESOLVED_CACHE_PATH } = require('./locatorRepository.service');
const { isConfigured, getLatestCommitOnBranch } = require('./gitIntegration.service');

// What commit THIS process is actually running right now. Railway sets
// these env vars automatically on every deploy; local dev falls back to
// reading git directly — read-only commands only (rev-parse/log), never
// pull or fetch, since there's nothing here that should mutate the
// workspace just to report on it.
function getRunningBuildInfo() {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) {
    return {
      environment: 'production',
      repo: process.env.RAILWAY_GIT_REPO_NAME || null,
      branch: process.env.RAILWAY_GIT_BRANCH || null,
      commitSha: process.env.RAILWAY_GIT_COMMIT_SHA,
      author: process.env.RAILWAY_GIT_AUTHOR || null,
      commitMessage: process.env.RAILWAY_GIT_COMMIT_MESSAGE || null,
    };
  }
  try {
    return {
      environment: 'local',
      repo: execSync('git remote get-url origin', { cwd: __dirname, encoding: 'utf-8' }).trim(),
      branch: execSync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname, encoding: 'utf-8' }).trim(),
      commitSha: execSync('git rev-parse HEAD', { cwd: __dirname, encoding: 'utf-8' }).trim(),
      author: execSync('git log -1 --format=%an', { cwd: __dirname, encoding: 'utf-8' }).trim(),
      commitMessage: execSync('git log -1 --format=%s', { cwd: __dirname, encoding: 'utf-8' }).trim(),
    };
  } catch {
    return { environment: 'unknown', repo: null, branch: null, commitSha: null, author: null, commitMessage: null };
  }
}

// The literal "is Git the single source of truth here" check: compares the
// running build against GitHub's actual latest commit on the deploy
// branch via the API — there's no git inside the deployed container to
// fetch/pull, so this is the buildable equivalent that works identically
// in both local dev and production. Pure read/compare — never mutates
// anything, so there's no destructive-pull risk to worry about.
async function getSourceSyncStatus() {
  const running = getRunningBuildInfo();
  let latest = null;
  let checkError = null;
  if (isConfigured()) {
    try {
      latest = await getLatestCommitOnBranch();
    } catch (err) {
      checkError = err.message;
    }
  } else {
    checkError = 'GITHUB_TOKEN / GITHUB_REPO not configured — cannot check the latest commit on GitHub.';
  }

  const cacheLoaded = fs.existsSync(RESOLVED_CACHE_PATH);
  let cacheEntryCount = 0;
  try {
    cacheEntryCount = Object.keys(JSON.parse(fs.readFileSync(RESOLVED_CACHE_PATH, 'utf-8'))).length;
  } catch {
    // no cache file yet — cacheEntryCount stays 0
  }

  return {
    ...running,
    latestCommitSha: latest?.sha || null,
    latestCommitAuthor: latest?.author || null,
    latestCommitMessage: latest?.message || null,
    latestCommitAt: latest?.committedAt || null,
    // null means "couldn't check" (not configured / API error) — distinct
    // from false ("checked, and it's stale") so the UI can render a quiet
    // "unknown" state instead of a false alarm.
    upToDate: latest ? running.commitSha === latest.sha : null,
    checkError,
    locatorCache: { loaded: cacheLoaded, entryCount: cacheEntryCount },
  };
}

module.exports = { getRunningBuildInfo, getSourceSyncStatus };
