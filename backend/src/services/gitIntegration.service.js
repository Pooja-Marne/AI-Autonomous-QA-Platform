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

// Opens a PR that updates exactly one Page Object property's locator.
// Never touches the base branch directly — always a new branch + PR, so
// nothing lands in production code without human review, per "do not
// modify production code silently".
async function createLocatorFixPR({ pageObject, propertyName, originalLocator, healedLocator, confidenceScore, healingReason }) {
  if (!isConfigured()) {
    return {
      success: false,
      reason: 'GITHUB_TOKEN / GITHUB_REPO not configured on the server — no commit or PR was created. The locator is still active at runtime via the Locator Repository; apply it to source manually or configure Git integration to automate this.',
    };
  }

  const gh = client();
  const filePathRel = `tests/playwright/pages/${pageObject}.js`;

  try {
    const { data: baseRef } = await gh.get(`/repos/${GITHUB_REPO}/git/ref/heads/${GITHUB_BASE_BRANCH}`);
    const baseSha = baseRef.object.sha;

    const branchName = `ai-healing/${pageObject}-${propertyName}-${Date.now()}`;
    await gh.post(`/repos/${GITHUB_REPO}/git/refs`, { ref: `refs/heads/${branchName}`, sha: baseSha });

    const { data: fileData } = await gh.get(`/repos/${GITHUB_REPO}/contents/${filePathRel}`, { params: { ref: branchName } });
    const currentContent = Buffer.from(fileData.content, 'base64').toString('utf-8');

    const propRegex = buildResolveCallRegex({ pageObject, propertyName });
    if (!propRegex.test(currentContent)) {
      return { success: false, reason: `Could not find resolve('${pageObject}.${propertyName}', ...) in ${filePathRel} to patch — no PR created.` };
    }
    const updatedContent = currentContent.replace(propRegex, (_m, cls, prop, quote) => `resolve('${cls}.${prop}', ${quote}${healedLocator}${quote})`);

    const { data: commitData } = await gh.put(`/repos/${GITHUB_REPO}/contents/${filePathRel}`, {
      message: `fix(ai-healing): update ${pageObject}.${propertyName} locator\n\n${healingReason || ''}\nConfidence: ${confidenceScore ?? 'n/a'}%\nOld: ${originalLocator}\nNew: ${healedLocator}`,
      content: Buffer.from(updatedContent).toString('base64'),
      sha: fileData.sha,
      branch: branchName,
    });

    const { data: pr } = await gh.post(`/repos/${GITHUB_REPO}/pulls`, {
      title: `AI Healing: fix ${pageObject}.${propertyName} locator`,
      head: branchName,
      base: GITHUB_BASE_BRANCH,
      body: [
        'Automated locator fix from the AI Healing Agent — approved via the dashboard.',
        '',
        `- **Page Object**: ${pageObject}`,
        `- **Property**: ${propertyName}`,
        `- **Original locator**: \`${originalLocator}\``,
        `- **Healed locator**: \`${healedLocator}\``,
        `- **Confidence**: ${confidenceScore ?? 'n/a'}%`,
        `- **Reason**: ${healingReason || 'N/A'}`,
      ].join('\n'),
    });

    return { success: true, commitSha: commitData.commit.sha, prUrl: pr.html_url, prNumber: pr.number, branch: branchName };
  } catch (err) {
    return { success: false, reason: err.response?.data?.message || err.message };
  }
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

module.exports = { createLocatorFixPR, isConfigured, getPullRequest, getLatestCommitOnBranch };
