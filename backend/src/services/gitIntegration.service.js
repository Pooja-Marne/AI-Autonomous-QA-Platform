const axios = require('axios');
const { buildResolveCallRegex } = require('./pageObjectSource.service');

// Uses the GitHub REST Contents/PRs API rather than shelling out to `git` —
// the running container has no configured push credentials or guaranteed
// git remote, and the Contents API can create a commit + branch + PR with
// nothing but a token, which is what a server-side integration needs.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // "owner/repo"
const GITHUB_BASE_BRANCH = process.env.GITHUB_BASE_BRANCH || 'feature/ai-qa-platform';

function isConfigured() {
  return Boolean(GITHUB_TOKEN && GITHUB_REPO);
}

function client() {
  return axios.create({
    baseURL: 'https://api.github.com',
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
  });
}

// Builds the PR body for a batch of fixes — a markdown table of everything
// included, reasoning collapsed under a <details> block (keeps the top of
// the PR scannable even with many fixes), and a clearly separated
// "not included" section for anything that couldn't be applied.
function buildBatchPrBody(included, skipped) {
  const rows = included.map((f) =>
    `| ${f.pageObject} | ${f.propertyName} | \`${f.originalLocator}\` | \`${f.healedLocator}\` | ${f.confidenceScore ?? 'n/a'}% |`
  ).join('\n');
  const reasons = included.map((f) => `**${f.pageObject}.${f.propertyName}**: ${f.healingReason || 'N/A'}`).join('\n\n');
  const skippedBlock = skipped.length
    ? `\n\n### ⚠️ Not included in this PR\n${skipped.map((s) => `- ${s.pageObject}.${s.propertyName} — ${s.reason}`).join('\n')}`
    : '';
  return [
    `Automated locator fix${included.length === 1 ? '' : 'es'} from the AI Healing Agent — approved via the dashboard.`,
    '',
    '| Page Object | Property | Original Locator | Healed Locator | Confidence |',
    '|---|---|---|---|---|',
    rows,
    '',
    '<details><summary>Reasoning per fix</summary>',
    '',
    reasons,
    '',
    '</details>',
    skippedBlock,
  ].join('\n');
}

// Opens ONE PR covering an arbitrary batch of locator fixes — potentially
// spanning multiple Page Object files, or multiple properties within the
// same file — as a single atomic commit via GitHub's Git Data API (blobs +
// tree + commit), rather than one PR per locator. Approving several fixes
// from the same regression run used to open several separate PRs, which
// could conflict with each other if they touched the same file from a
// stale base (this happened for real — see PR #5/#6 history). Never
// touches the base branch directly — always a new branch + PR, so nothing
// lands in production code without human review.
async function createBatchLocatorFixPR(fixes) {
  if (!isConfigured()) {
    return {
      success: false, included: [], skipped: fixes.map((f) => ({ ...f, reason: 'Git integration not configured' })),
      reason: 'GITHUB_TOKEN / GITHUB_REPO not configured on the server — no commit or PR was created. Locators are still active at runtime via the Locator Repository; apply them to source manually or configure Git integration to automate this.',
    };
  }

  const gh = client();
  const skipped = [];
  const included = [];
  const treeEntries = [];

  try {
    // Dedupe within the batch BEFORE touching any file — two rows for the
    // same pageObject+propertyName (duplicate submission, stale UI
    // selection) would otherwise silently patch the same resolve() call
    // twice, with the second value winning while BOTH rows get marked
    // pr_open against a commit that only reflects one of them.
    const seen = new Map();
    for (const fix of fixes) {
      const key = `${fix.pageObject}::${fix.propertyName}`;
      if (seen.has(key)) {
        skipped.push({ ...fix, reason: `Duplicate of ${key} already included earlier in this batch` });
        continue;
      }
      seen.set(key, fix);
    }
    const byFile = new Map();
    for (const fix of seen.values()) {
      if (!byFile.has(fix.pageObject)) byFile.set(fix.pageObject, []);
      byFile.get(fix.pageObject).push(fix);
    }

    const { data: baseRef } = await gh.get(`/repos/${GITHUB_REPO}/git/ref/heads/${GITHUB_BASE_BRANCH}`);
    const baseCommitSha = baseRef.object.sha;
    const { data: baseCommit } = await gh.get(`/repos/${GITHUB_REPO}/git/commits/${baseCommitSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    for (const [pageObject, fileFixes] of byFile) {
      const filePath = `tests/playwright/pages/${pageObject}.js`;
      const { data: fileData } = await gh.get(`/repos/${GITHUB_REPO}/contents/${filePath}`, { params: { ref: GITHUB_BASE_BRANCH } });
      let content = Buffer.from(fileData.content, 'base64').toString('utf-8');
      const original = content;

      // Threaded through the EVOLVING string — each property's regex is
      // applied to the result of the previous replace, not the original,
      // so multiple properties in the same file all land correctly.
      for (const fix of fileFixes) {
        const regex = buildResolveCallRegex({ pageObject, propertyName: fix.propertyName });
        if (!regex.test(content)) {
          skipped.push({ ...fix, reason: `Could not find resolve('${pageObject}.${fix.propertyName}', ...) in ${filePath}` });
          continue;
        }
        content = content.replace(regex, (_m, cls, prop, quote) => `resolve('${cls}.${prop}', ${quote}${fix.healedLocator}${quote})`);
        included.push(fix);
      }
      if (content === original) continue; // nothing actually changed in this file

      const { data: blob } = await gh.post(`/repos/${GITHUB_REPO}/git/blobs`, { content: Buffer.from(content).toString('base64'), encoding: 'base64' });
      treeEntries.push({ path: filePath, mode: '100644', type: 'blob', sha: blob.sha });
    }

    // Never create an empty commit/PR if every fix in the batch got skipped.
    if (treeEntries.length === 0) {
      return { success: false, included: [], skipped, reason: 'No fixes could be applied to source.' };
    }

    const { data: newTree } = await gh.post(`/repos/${GITHUB_REPO}/git/trees`, { base_tree: baseTreeSha, tree: treeEntries });
    const { data: newCommit } = await gh.post(`/repos/${GITHUB_REPO}/git/commits`, {
      message: `fix(ai-healing): batch locator fixes (${included.length})\n\n${included.map((f) => `- ${f.pageObject}.${f.propertyName}: ${f.originalLocator} -> ${f.healedLocator}`).join('\n')}`,
      tree: newTree.sha,
      parents: [baseCommitSha],
    });
    // Branch created LAST, pointing straight at the final commit — unlike
    // the old single-fix flow (branch first, then commit into it via the
    // Contents API), so an early failure never leaves an orphan branch.
    // Single-fix batches keep the old, more specific branch/title wording
    // (named after the actual property, "1 locator(s) across 1 page
    // object(s)" reads awkwardly) — createLocatorFixPR is just this
    // function called with a one-item array, so this is the only place
    // that distinction needs to live.
    const isSingleFix = included.length === 1;
    const branch = isSingleFix
      ? `ai-healing/${included[0].pageObject}-${included[0].propertyName}-${Date.now()}`
      : `ai-healing/batch-${Date.now()}`;
    await gh.post(`/repos/${GITHUB_REPO}/git/refs`, { ref: `refs/heads/${branch}`, sha: newCommit.sha });

    const { data: pr } = await gh.post(`/repos/${GITHUB_REPO}/pulls`, {
      title: isSingleFix
        ? `AI Healing: fix ${included[0].pageObject}.${included[0].propertyName} locator`
        : `AI Healing: batch fix ${included.length} locators across ${byFile.size} page objects`,
      head: branch,
      base: GITHUB_BASE_BRANCH,
      body: buildBatchPrBody(included, skipped),
    });

    return { success: true, commitSha: newCommit.sha, prUrl: pr.html_url, prNumber: pr.number, branch, included, skipped };
  } catch (err) {
    return { success: false, included: [], skipped: fixes.map((f) => ({ ...f, reason: err.response?.data?.message || err.message })), reason: err.response?.data?.message || err.message };
  }
}

// Single-fix approval is a thin wrapper around the batch path — no
// duplicated patch logic between the two.
async function createLocatorFixPR(fix) {
  const result = await createBatchLocatorFixPR([fix]);
  return result.included.length === 1
    ? { success: true, commitSha: result.commitSha, prUrl: result.prUrl, prNumber: result.prNumber, branch: result.branch }
    : { success: false, reason: result.skipped[0]?.reason || result.reason };
}

// Checks a previously-opened PR's current merge state — used by the
// GitHub merge poller to detect a merge without relying on webhooks.
async function getPullRequest(prNumber) {
  const gh = client();
  const { data } = await gh.get(`/repos/${GITHUB_REPO}/pulls/${prNumber}`);
  return {
    number: data.number,
    merged: data.merged,
    mergedAt: data.merged_at,
    mergeCommitSha: data.merge_commit_sha,
    state: data.state,
  };
}

// The actual source of truth for "what's the latest commit on the deploy
// branch" — used to compare against whatever commit a running instance
// actually has, without needing git inside the container at all (there
// is no .git in the deployed image — see .dockerignore).
async function getLatestCommitOnBranch() {
  const gh = client();
  const { data } = await gh.get(`/repos/${GITHUB_REPO}/commits/${GITHUB_BASE_BRANCH}`);
  return {
    sha: data.sha,
    author: data.commit.author.name,
    message: data.commit.message,
    committedAt: data.commit.author.date,
  };
}

module.exports = { createLocatorFixPR, createBatchLocatorFixPR, isConfigured, getPullRequest, getLatestCommitOnBranch };
