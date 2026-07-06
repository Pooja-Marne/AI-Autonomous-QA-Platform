const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const { getDatabase } = require('../config/database');

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'should', 'when', 'then',
  'able', 'user', 'users', 'page', 'test', 'tests', 'issue', 'story', 'bug',
  'into', 'have', 'must', 'will', 'their', 'them', 'these', 'those', 'also',
]);

function tokenize(text) {
  return Array.from(new Set(
    (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
  ));
}

function walkFiles(dir, extFilter) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkFiles(full, extFilter));
    else if (extFilter(entry.name)) results.push(full);
  }
  return results;
}

function parseSpecFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const describeMatch = content.match(/test\.describe\(\s*['"`]([^'"`]+)['"`]/);
  const describeTitle = describeMatch ? describeMatch[1] : '';

  const tests = [];
  const testRegex = /test(?:\.skip|\.only)?\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = testRegex.exec(content)) !== null) {
    const title = m[1];
    const tags = Array.from(title.matchAll(/@(\w+)/g)).map((t) => t[1].toLowerCase());
    tests.push({ title, tags });
  }

  const pageObjectImports = Array.from(content.matchAll(/require\(['"`].*\/pages\/(\w+)['"`]\)/g)).map((x) => x[1]);

  return { file: filePath, describeTitle, tests, pageObjectImports };
}

function listPageObjectNames(pagesDir) {
  return walkFiles(pagesDir, (name) => name.endsWith('.js')).map((f) => path.basename(f, '.js'));
}

function relativeToAutomationRoot(filePath) {
  return path.relative(config.automation.repoPath, filePath).replace(/\\/g, '/');
}

// Cross-references matched test titles against this platform's own test_cases
// history (populated whenever tests run through the platform) — the
// authoritative source for pass/fail/recency/flakiness, since the static
// results.json on disk only ever reflects the single most recent run.
function getExecutionHistory(testTitle) {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT status, created_at FROM test_cases
    WHERE name LIKE ? ORDER BY created_at DESC LIMIT 10
  `).all(`%${testTitle.replace(/^@\w+\s*/, '').slice(0, 60)}%`);

  if (!rows.length) {
    return { executed: false, passing: null, lastRun: null, flaky: false, recentlyExecuted: false };
  }

  const statuses = new Set(rows.map((r) => r.status));
  const lastRun = rows[0].created_at;
  const recentlyExecuted = (Date.now() - new Date(lastRun).getTime()) < 14 * 24 * 60 * 60 * 1000;

  return {
    executed: true,
    passing: rows[0].status === 'passed',
    lastRun,
    flaky: statuses.size > 1,
    recentlyExecuted,
  };
}

// Step 4: search the local Playwright automation repo for existing coverage of
// a Jira issue, by exact key, keyword overlap with the summary, Page Object
// names for changed UI pages, and module/folder correlation.
function scanForCoverage({ jiraKey, summary = '', description = '', changedModules = [], changedUiPages = [] }) {
  const specsDir = path.join(config.automation.repoPath, 'playwright', 'specs');
  const pagesDir = path.join(config.automation.repoPath, 'playwright', 'pages');

  const specFiles = walkFiles(specsDir, (name) => name.endsWith('.spec.js'));
  const pageObjectNames = listPageObjectNames(pagesDir).map((n) => n.toLowerCase());

  const issueTokens = tokenize(`${summary} ${description}`);
  const uiPageBasenames = changedUiPages.map((p) => path.basename(p, path.extname(p)).toLowerCase());

  const candidates = [];

  for (const filePath of specFiles) {
    const parsed = parseSpecFile(filePath);
    const relFile = relativeToAutomationRoot(filePath);
    const folderModule = relFile.split('/')[2] || ''; // playwright/specs/<module>/...

    for (const t of parsed.tests) {
      let score = 0;
      const reasons = [];

      if (jiraKey && t.title.toUpperCase().includes(jiraKey.toUpperCase())) {
        score += 100;
        reasons.push('jira_key_match');
      }

      const titleTokens = tokenize(t.title);
      const overlap = titleTokens.filter((tok) => issueTokens.includes(tok));
      if (overlap.length) {
        score += overlap.length * 5;
        reasons.push(`keyword_overlap:${overlap.join(',')}`);
      }

      if (changedModules.some((mod) => mod.toLowerCase() === folderModule.toLowerCase())) {
        score += 10;
        reasons.push(`module_match:${folderModule}`);
      }

      if (parsed.pageObjectImports.some((po) => uiPageBasenames.includes(po.toLowerCase()))) {
        score += 15;
        reasons.push('page_object_match');
      }

      if (score > 0) {
        candidates.push({
          file: relFile,
          describeTitle: parsed.describeTitle,
          title: t.title,
          tags: t.tags,
          score,
          reasons,
          ...getExecutionHistory(t.title),
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const regressionSuiteTags = Array.from(new Set(candidates.flatMap((c) => c.tags)));

  return {
    candidates,
    hasAnyMatch: candidates.length > 0,
    jiraKeyDirectMatch: candidates.some((c) => c.reasons.includes('jira_key_match')),
    regressionSuiteTags,
  };
}

module.exports = { scanForCoverage, getExecutionHistory };
