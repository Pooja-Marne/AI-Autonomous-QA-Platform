const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { getDatabase } = require('../config/database');

const jiraClient = axios.create({
  baseURL: `${config.jira.baseUrl}/rest/api/3`,
  auth: {
    username: config.jira.email,
    password: config.jira.apiToken,
  },
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Finds the active sprint across all boards for the project. Deliberately
// does NOT filter boards by type=scrum: team-managed ("next-gen") Scrum
// boards report back as type "simple" via the Agile API despite supporting
// sprints, so filtering by type silently hides them.
async function findActiveSprint() {
  const boardsRes = await jiraClient.get('/board', {
    baseURL: `${config.jira.baseUrl}/rest/agile/1.0`,
    params: { projectKeyOrId: config.jira.projectKey },
  });
  const boards = boardsRes.data.values || [];

  for (const board of boards) {
    const sprintRes = await jiraClient.get(`/board/${board.id}/sprint`, {
      baseURL: `${config.jira.baseUrl}/rest/agile/1.0`,
      params: { state: 'active' },
    }).catch(() => ({ data: { values: [] } })); // e.g. pure Kanban boards 400 on /sprint

    const sprints = sprintRes.data.values || [];
    if (sprints.length) return { boardId: board.id, sprint: sprints[0] };
  }

  return { boardId: null, sprint: null };
}

async function fetchActiveSprintIssues() {
  try {
    const { boardId, sprint } = await findActiveSprint();
    if (!sprint) return { issues: [], sprint: null };

    const issuesRes = await jiraClient.get(`/board/${boardId}/sprint/${sprint.id}/issue`, {
      baseURL: `${config.jira.baseUrl}/rest/agile/1.0`,
      params: { maxResults: 100, fields: DETAIL_FIELDS },
    });

    const issues = issuesRes.data.issues || [];
    await cacheJiraIssues(issues, sprint.name);
    return { issues: issues.map(mapIssue), sprint: sprint.name };
  } catch (err) {
    console.error('[Jira] fetchActiveSprintIssues error:', err.message);
    return getCachedIssues();
  }
}

// Step 1 of the Coverage Intelligence Agent: active sprint issues, filtered to
// configurable "testable" statuses (Done/Closed/Resolved/Ready for Testing by
// default), with full metadata for Step 2. Story/Bug/Task/Sub-task all included
// here for sprint-level counts; the deep per-issue pipeline only runs on
// config.jira.analysisIssueTypes (Story/Bug by default).
async function fetchTestableSprintIssues() {
  const { issues, sprint } = await fetchActiveSprintIssues();
  const testable = (issues || []).filter((issue) =>
    config.jira.testableStatuses.some((s) => s.toLowerCase() === (issue.status || '').toLowerCase())
  );
  return { issues: testable, sprint };
}

async function fetchBugsAndFailures() {
  try {
    const jql = `project = ${config.jira.projectKey} AND issuetype = Bug AND status != Done ORDER BY created DESC`;
    const res = await jiraClient.get('/search/jql', {
      params: { jql, maxResults: 50, fields: 'summary,status,priority,assignee,description,issuetype' },
    });
    const bugs = res.data.issues || [];
    await cacheJiraIssues(bugs, 'bugs');
    return bugs.map(mapIssue);
  } catch (err) {
    console.error('[Jira] fetchBugsAndFailures error:', err.message);
    return [];
  }
}

async function fetchAllIssues() {
  try {
    const jql = `project = ${config.jira.projectKey} ORDER BY updated DESC`;
    const res = await jiraClient.get('/search/jql', {
      params: { jql, maxResults: 100, fields: 'summary,status,priority,assignee,description,issuetype,sprint' },
    });
    const issues = res.data.issues || [];
    await cacheJiraIssues(issues, 'all');
    return { issues: issues.map(mapIssue), total: res.data.total };
  } catch (err) {
    console.error('[Jira] fetchAllIssues error:', err.message);
    return getCachedIssues();
  }
}

async function createJiraIssue({ summary, description, issueType = 'Bug', priority = 'Medium' }) {
  try {
    const projectRes = await jiraClient.get(`/project/${config.jira.projectKey}`);
    const res = await jiraClient.post('/issue', {
      fields: {
        project: { key: config.jira.projectKey },
        summary,
        description: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
        },
        issuetype: { name: issueType },
        priority: { name: priority },
      },
    });
    return { key: res.data.key, id: res.data.id, url: `${config.jira.baseUrl}/browse/${res.data.key}` };
  } catch (err) {
    console.error('[Jira] createJiraIssue error:', err.message);
    throw err;
  }
}

async function addCommentToIssue(issueKey, comment) {
  try {
    await jiraClient.post(`/issue/${issueKey}/comment`, {
      body: {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: comment }] }],
      },
    });
    return true;
  } catch (err) {
    console.error('[Jira] addCommentToIssue error:', err.message);
    return false;
  }
}

function mapIssue(issue) {
  const fields = issue.fields || {};
  return {
    id: issue.id,
    key: issue.key,
    summary: fields.summary,
    type: fields.issuetype?.name || 'Unknown',
    status: fields.status?.name || 'Unknown',
    priority: fields.priority?.name || 'Medium',
    assignee: fields.assignee?.displayName || 'Unassigned',
    sprint: fields.sprint?.name || null,
    description: fields.description?.content?.[0]?.content?.[0]?.text || '',
    url: `${config.jira.baseUrl}/browse/${issue.key}`,
  };
}

// Flattens an Atlassian Document Format (ADF) description into plain text
function extractPlainText(adf) {
  if (!adf || !adf.content) return '';
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'text' && node.text) parts.push(node.text);
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  adf.content.forEach(walk);
  return parts.join(' ').trim();
}

// Acceptance Criteria isn't a standard Jira field — heuristically pull a labeled
// section out of the description; otherwise the full description is passed to
// the LLM anyway with a note that AC may be embedded in it.
function extractAcceptanceCriteria(descriptionText) {
  if (!descriptionText) return '';
  const match = descriptionText.match(/acceptance criteria[:\-\s]*([\s\S]*?)(?:\n\n|$)/i);
  return match ? match[1].trim() : '';
}

function mapIssueDetailed(issue) {
  const fields = issue.fields || {};
  const descriptionText = fields.description?.content
    ? extractPlainText(fields.description)
    : (typeof fields.description === 'string' ? fields.description : '');

  return {
    id: issue.id,
    key: issue.key,
    summary: fields.summary,
    type: fields.issuetype?.name || 'Unknown',
    status: fields.status?.name || 'Unknown',
    priority: fields.priority?.name || 'Medium',
    assignee: fields.assignee?.displayName || 'Unassigned',
    sprint: fields.sprint?.name || (Array.isArray(fields.sprint) ? fields.sprint[0]?.name : null) || null,
    description: descriptionText,
    acceptanceCriteria: extractAcceptanceCriteria(descriptionText),
    labels: fields.labels || [],
    components: (fields.components || []).map((c) => c.name),
    fixVersions: (fields.fixVersions || []).map((v) => v.name),
    linkedIssues: (fields.issuelinks || []).map((link) => {
      const linked = link.outwardIssue || link.inwardIssue;
      return linked ? {
        key: linked.key,
        summary: linked.fields?.summary,
        type: link.type?.name || 'relates to',
        direction: link.outwardIssue ? 'outward' : 'inward',
      } : null;
    }).filter(Boolean),
    url: `${config.jira.baseUrl}/browse/${issue.key}`,
  };
}

const DETAIL_FIELDS = 'summary,description,status,priority,assignee,issuetype,sprint,labels,components,fixVersions,issuelinks';

async function fetchIssueDetails(issueKey) {
  try {
    const res = await jiraClient.get(`/issue/${issueKey}`, { params: { fields: DETAIL_FIELDS } });
    return mapIssueDetailed(res.data);
  } catch (err) {
    console.error(`[Jira] fetchIssueDetails(${issueKey}) error:`, err.message);
    return null;
  }
}

async function cacheJiraIssues(issues, context) {
  const db = getDatabase();
  const upsert = db.prepare(`
    INSERT INTO jira_issues (id, key, summary, type, status, priority, assignee, sprint, description, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      summary=excluded.summary, status=excluded.status, priority=excluded.priority,
      assignee=excluded.assignee, sprint=excluded.sprint, fetched_at=CURRENT_TIMESTAMP
  `);
  db.exec('BEGIN');
  try {
    for (const issue of issues) {
      const mapped = mapIssue(issue);
      upsert.run(mapped.id, mapped.key, mapped.summary, mapped.type, mapped.status, mapped.priority, mapped.assignee, mapped.sprint || context, mapped.description);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getCachedIssues() {
  const db = getDatabase();
  const rows = db.prepare('SELECT * FROM jira_issues ORDER BY fetched_at DESC LIMIT 100').all();
  return { issues: rows, sprint: 'cached' };
}

module.exports = {
  fetchActiveSprintIssues, fetchBugsAndFailures, fetchAllIssues, createJiraIssue, addCommentToIssue,
  fetchTestableSprintIssues, fetchIssueDetails, mapIssueDetailed,
};
