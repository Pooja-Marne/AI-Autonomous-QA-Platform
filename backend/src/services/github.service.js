const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { getDatabase } = require('../config/database');

const githubClient = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `Bearer ${config.github.token}`,
    Accept: 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  timeout: 15000,
});

const { owner, repo, baseBranch } = config.github;

async function fetchLatestCommits(branch = baseBranch, count = 20) {
  try {
    const res = await githubClient.get(`/repos/${owner}/${repo}/commits`, {
      params: { sha: branch, per_page: count },
    });
    const commits = res.data.map((c) => ({
      sha: c.sha.substring(0, 7),
      fullSha: c.sha,
      message: c.commit.message.split('\n')[0],
      author: c.commit.author.name,
      date: c.commit.author.date,
      url: c.html_url,
    }));
    await cacheGitChanges(commits.map((c) => ({ ...c, type: 'commit', branch })));
    return commits;
  } catch (err) {
    console.error('[GitHub] fetchLatestCommits error:', err.message);
    return getCachedChanges('commit');
  }
}

async function fetchOpenPRs() {
  try {
    const res = await githubClient.get(`/repos/${owner}/${repo}/pulls`, {
      params: { state: 'open', per_page: 30 },
    });
    const prs = await Promise.all(
      res.data.map(async (pr) => {
        const filesRes = await githubClient.get(`/repos/${owner}/${repo}/pulls/${pr.number}/files`).catch(() => ({ data: [] }));
        const files = filesRes.data.map((f) => f.filename);
        const impactedModules = detectImpactedModules(files);
        return {
          id: String(pr.id),
          number: pr.number,
          title: pr.title,
          author: pr.user.login,
          branch: pr.head.ref,
          base: pr.base.ref,
          state: pr.state,
          files,
          impactedModules,
          url: pr.html_url,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
        };
      })
    );
    await cacheGitChanges(prs.map((pr) => ({ ...pr, type: 'pr', sha: null, message: pr.title, filesChanged: JSON.stringify(pr.files) })));
    return prs;
  } catch (err) {
    console.error('[GitHub] fetchOpenPRs error:', err.message);
    return getCachedChanges('pr');
  }
}

async function fetchBranches() {
  try {
    const res = await githubClient.get(`/repos/${owner}/${repo}/branches`, { params: { per_page: 50 } });
    return res.data.map((b) => ({ name: b.name, sha: b.commit.sha.substring(0, 7), protected: b.protected }));
  } catch (err) {
    console.error('[GitHub] fetchBranches error:', err.message);
    return [];
  }
}

async function fetchChangedFilesForPR(prNumber) {
  try {
    const res = await githubClient.get(`/repos/${owner}/${repo}/pulls/${prNumber}/files`);
    return res.data.map((f) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions }));
  } catch (err) {
    console.error('[GitHub] fetchChangedFilesForPR error:', err.message);
    return [];
  }
}

async function fetchRepoInfo() {
  try {
    const [repoRes, branchesRes, commitsRes, prsRes] = await Promise.all([
      githubClient.get(`/repos/${owner}/${repo}`),
      fetchBranches(),
      fetchLatestCommits(baseBranch, 5),
      fetchOpenPRs(),
    ]);
    return {
      name: repoRes.data.name,
      fullName: repoRes.data.full_name,
      description: repoRes.data.description,
      defaultBranch: repoRes.data.default_branch,
      stars: repoRes.data.stargazers_count,
      openIssues: repoRes.data.open_issues_count,
      url: repoRes.data.html_url,
      branches: branchesRes,
      recentCommits: commitsRes,
      openPRs: prsRes,
    };
  } catch (err) {
    console.error('[GitHub] fetchRepoInfo error:', err.message);
    return null;
  }
}

// Step 3 of the Coverage Intelligence Agent: find commits/PRs that reference a
// Jira key in their message/title (e.g. "SCRUM-123 fix login bug").
async function searchCommitsByJiraKey(jiraKey) {
  try {
    const res = await githubClient.get('/search/commits', {
      params: { q: `${jiraKey} repo:${owner}/${repo}`, per_page: 20 },
      headers: { Accept: 'application/vnd.github.cloak-preview+json' },
    });
    return (res.data.items || []).map((c) => ({
      sha: c.sha.substring(0, 7),
      fullSha: c.sha,
      message: c.commit.message.split('\n')[0],
      author: c.commit.author?.name || c.author?.login || 'Unknown',
      date: c.commit.author?.date,
      url: c.html_url,
    }));
  } catch (err) {
    console.error(`[GitHub] searchCommitsByJiraKey(${jiraKey}) error:`, err.message);
    return [];
  }
}

async function searchPRsByJiraKey(jiraKey) {
  try {
    const res = await githubClient.get('/search/issues', {
      params: { q: `${jiraKey} repo:${owner}/${repo} type:pr`, per_page: 20 },
    });
    const prs = await Promise.all(
      (res.data.items || []).map(async (item) => {
        const files = await fetchChangedFilesForPR(item.number).catch(() => []);
        const filenames = files.map((f) => f.filename);
        return {
          number: item.number,
          title: item.title,
          author: item.user?.login,
          state: item.state,
          merged: !!item.pull_request?.merged_at,
          mergedAt: item.pull_request?.merged_at || null,
          files: filenames,
          impactedModules: detectImpactedModules(filenames),
          url: item.html_url,
        };
      })
    );
    return prs;
  } catch (err) {
    console.error(`[GitHub] searchPRsByJiraKey(${jiraKey}) error:`, err.message);
    return [];
  }
}

function detectImpactedModules(files) {
  const moduleMap = {
    auth: ['auth', 'login', 'register', 'oauth', 'token'],
    api: ['api', 'routes', 'endpoints', 'controllers'],
    database: ['db', 'database', 'models', 'migrations', 'schema'],
    ui: ['components', 'pages', 'views', 'frontend', 'src'],
    tests: ['test', 'spec', 'e2e', '__tests__'],
    config: ['config', 'env', 'settings'],
    services: ['services', 'utils', 'helpers', 'lib'],
  };

  const impacted = new Set();
  for (const file of files) {
    const lower = file.toLowerCase();
    for (const [module, keywords] of Object.entries(moduleMap)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        impacted.add(module);
      }
    }
  }
  return Array.from(impacted);
}

async function cacheGitChanges(changes) {
  const db = getDatabase();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO git_changes (id, type, sha, branch, title, author, message, files_changed, impacted_modules, url, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `);
  db.exec('BEGIN');
  try {
    for (const c of changes) {
      insert.run(
        uuidv4(),
        c.type,
        c.sha || c.fullSha || null,
        c.branch || null,
        c.title || c.message || null,
        c.author,
        c.message || c.title,
        c.filesChanged || JSON.stringify(c.files || []),
        JSON.stringify(c.impactedModules || []),
        c.url || null
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getCachedChanges(type) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM git_changes WHERE type = ? ORDER BY fetched_at DESC LIMIT 30').all(type);
}

module.exports = {
  fetchLatestCommits, fetchOpenPRs, fetchBranches, fetchChangedFilesForPR, fetchRepoInfo, detectImpactedModules,
  searchCommitsByJiraKey, searchPRsByJiraKey,
};
