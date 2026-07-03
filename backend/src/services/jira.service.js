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

async function fetchActiveSprintIssues() {
  try {
    const boardsRes = await jiraClient.get(`/board`, {
      baseURL: `${config.jira.baseUrl}/rest/agile/1.0`,
      params: { projectKeyOrId: config.jira.projectKey, type: 'scrum' },
    });
    const boards = boardsRes.data.values || [];
    if (!boards.length) return { issues: [], sprint: null };

    const boardId = boards[0].id;
    const sprintRes = await jiraClient.get(`/board/${boardId}/sprint`, {
      baseURL: `${config.jira.baseUrl}/rest/agile/1.0`,
      params: { state: 'active' },
    });
    const sprints = sprintRes.data.values || [];
    if (!sprints.length) return { issues: [], sprint: null };

    const sprint = sprints[0];
    const issuesRes = await jiraClient.get(`/board/${boardId}/sprint/${sprint.id}/issue`, {
      baseURL: `${config.jira.baseUrl}/rest/agile/1.0`,
      params: { maxResults: 100 },
    });

    const issues = issuesRes.data.issues || [];
    await cacheJiraIssues(issues, sprint.name);
    return { issues: issues.map(mapIssue), sprint: sprint.name };
  } catch (err) {
    console.error('[Jira] fetchActiveSprintIssues error:', err.message);
    return getCachedIssues();
  }
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

module.exports = { fetchActiveSprintIssues, fetchBugsAndFailures, fetchAllIssues, createJiraIssue, addCommentToIssue };
