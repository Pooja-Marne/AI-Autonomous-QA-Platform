const axios = require('axios');
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { getDatabase } = require('../config/database');
const { listExistingTests, formatExistingTestsForPrompt } = require('./specInventory.service');

const jiraClient = axios.create({
  baseURL: `${config.jira.baseUrl}/rest/api/3`,
  auth: { username: config.jira.email, password: config.jira.apiToken },
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

const openai = new OpenAI({ apiKey: config.openai.apiKey, baseURL: config.openai.baseURL });

// jira.service.js's mapIssue() only grabs the first paragraph's first text
// run for its cache — fine for a list view, not enough context for the LLM
// to judge coverage. This flattens the full ADF description into plain text.
function adfToPlainText(adf) {
  if (!adf?.content) return '';
  const lines = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'text') lines.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
    if (['paragraph', 'heading', 'listItem'].includes(node.type)) lines.push('\n');
  };
  adf.content.forEach(walk);
  return lines.join('').replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchIssueDetail(key) {
  try {
    const res = await jiraClient.get(`/issue/${key}`, {
      params: { fields: 'summary,description,issuetype,priority,status' },
    });
    const f = res.data.fields || {};
    return {
      key,
      summary: f.summary,
      type: f.issuetype?.name,
      priority: f.priority?.name,
      description: adfToPlainText(f.description),
    };
  } catch (err) {
    console.warn(`[CoverageRecommendation] Live fetch failed for ${key}, falling back to cache:`, err.message);
    const db = getDatabase();
    const cached = db.prepare('SELECT * FROM jira_issues WHERE key = ?').get(key);
    if (!cached) return null;
    return {
      key,
      summary: cached.summary,
      type: cached.type,
      priority: cached.priority,
      description: cached.description || '',
    };
  }
}

// The one real AI reasoning step: given the issue and the COMPLETE existing
// test inventory, the model itself decides what scenarios are needed and
// whether each is already covered (by meaning, not string matching) — no
// hardcoded rules here.
async function recommendCoverage({ key, summary, description, type, priority }) {
  if (!config.openai.apiKey) return { degraded: true, reason: 'OPENAI_API_KEY not configured', scenarios: [] };

  const existingTests = listExistingTests();
  const existingBlock = formatExistingTestsForPrompt(existingTests) || '(no Playwright specs found)';

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        {
          role: 'system',
          content: 'You are a senior QA engineer performing test coverage analysis for a just-closed Jira issue. You will be shown the issue and the COMPLETE current inventory of automated Playwright tests. Respond only with the requested JSON.',
        },
        {
          role: 'user',
          content: `Jira issue ${key} (${type || 'Unknown'}, priority ${priority || 'Unknown'}) was just closed.

Summary: ${summary || 'N/A'}
Description / Acceptance Criteria:
${description || 'N/A'}

Existing automated Playwright tests (module: describe > title [tags]):
${existingBlock}

Task:
1. List the SPECIFIC test scenarios needed to validate this issue (e.g. "Verify login fails with an expired session token", not vague suite names).
2. For EACH scenario, decide by MEANING (not exact text match) whether an existing test above already covers it.
3. Only propose scenarios directly relevant to this issue — do not pad with unrelated ideas.

Respond in JSON:
{"scenarios": [
  {"title": "<specific test case name>", "module": "<best-fit existing module, or a new short module name if none fits>",
   "rationale": "<one sentence: what this validates>", "covered": <true|false>,
   "matchedExistingTest": "<describe > title of the matching existing test, or null>"}
]}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
    });

    const parsed = JSON.parse(response.choices[0].message.content);
    const scenarios = Array.isArray(parsed.scenarios) ? parsed.scenarios : [];
    return { degraded: false, scenarios };
  } catch (err) {
    console.warn('[CoverageRecommendation] recommendCoverage failed:', err.message);
    return { degraded: true, reason: err.message, scenarios: [] };
  }
}

// Computed in code, not by the model, so the rollup stays consistent
// regardless of how the LLM phrases things.
function computeOverallStatus(scenarios) {
  if (scenarios.length === 0) return 'no_automation';
  const gaps = scenarios.filter((s) => !s.covered);
  if (gaps.length === 0) return 'fully_covered';
  if (gaps.length === scenarios.length) return 'no_automation';
  return 'partially_covered';
}

async function analyzeCoverage({ jiraKey, triggerId }) {
  const issue = await fetchIssueDetail(jiraKey);
  if (!issue) throw new Error(`Jira issue ${jiraKey} not found (live fetch and cache both failed)`);

  const result = await recommendCoverage(issue);
  if (result.degraded) {
    return { degraded: true, reason: result.reason, overallStatus: null, recommendations: [] };
  }

  const overallStatus = computeOverallStatus(result.scenarios);
  const analysisId = uuidv4();
  const db = getDatabase();
  const insert = db.prepare(`
    INSERT INTO test_case_recommendations
      (id, analysis_id, jira_key, jira_summary, trigger_id, title, module, rationale, coverage_status, matched_existing_test, overall_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec('BEGIN');
  try {
    for (const s of result.scenarios) {
      insert.run(
        uuidv4(), analysisId, jiraKey, issue.summary, triggerId || null,
        s.title, s.module || null, s.rationale || null,
        s.covered ? 'covered' : 'gap', s.covered ? (s.matchedExistingTest || null) : null,
        overallStatus
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    degraded: false,
    analysisId,
    overallStatus,
    recommendations: db.prepare(
      'SELECT * FROM test_case_recommendations WHERE analysis_id = ? ORDER BY coverage_status, created_at'
    ).all(analysisId),
  };
}

function getLatestRecommendations(jiraKey) {
  const db = getDatabase();
  const latest = db.prepare(
    'SELECT analysis_id FROM test_case_recommendations WHERE jira_key = ? ORDER BY created_at DESC LIMIT 1'
  ).get(jiraKey);
  if (!latest) return null;
  return db.prepare(
    'SELECT * FROM test_case_recommendations WHERE analysis_id = ? ORDER BY coverage_status, created_at'
  ).all(latest.analysis_id);
}

function dismissRecommendation(id) {
  const db = getDatabase();
  db.prepare('UPDATE test_case_recommendations SET dismissed = 1 WHERE id = ?').run(id);
  return { dismissed: true };
}

module.exports = { analyzeCoverage, getLatestRecommendations, dismissRecommendation };
