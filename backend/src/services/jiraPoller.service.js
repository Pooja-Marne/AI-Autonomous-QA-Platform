const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const config = require('../config/config');
const { getDatabase } = require('../config/database');

const RESOLVED_STATUSES = config.jira.testableStatuses;
const POLL_INTERVAL = '*/2 * * * *'; // Every 2 minutes

let pollerJob = null;
let consecutiveFailures = 0;
const MAX_FAILURES = 1; // Stop auto-polling after first persistent error; manual triggers still work

const jiraClient = axios.create({
  baseURL: `${config.jira.baseUrl}/rest/api/3`,
  auth: { username: config.jira.email, password: config.jira.apiToken },
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

async function pollForResolvedIssues() {
  const db = getDatabase();
  console.log('[JiraPoller] Checking for newly resolved issues...');

  try {
    // Simple robust JQL: all Done issues updated recently, filter by time in code
    // Using status = Done (most universal) — avoids statusCategory 410 on some instances
    const jql = `project = ${config.jira.projectKey} AND status = "Done" ORDER BY updated DESC`;

    const res = await jiraClient.get('/search/jql', {
      params: {
        jql,
        maxResults: 20,
        fields: 'summary,status,priority,assignee,issuetype,updated',
      },
    }).catch(async (err) => {
      // Fallback: fetch all issues without status filter if primary fails
      if (err.response?.status === 410 || err.response?.status === 400) {
        return jiraClient.get('/search/jql', {
          params: {
            jql: `project = ${config.jira.projectKey} ORDER BY updated DESC`,
            maxResults: 10,
            fields: 'summary,status,priority,assignee,issuetype,updated',
          },
        });
      }
      throw err;
    });

    // Filter to only recently updated resolved issues (last 10 min) in code
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const recentIssues = (res.data.issues || []).filter((issue) => {
      const updatedAt = new Date(issue.fields?.updated || 0);
      const statusName = issue.fields?.status?.name || '';
      const isResolved = RESOLVED_STATUSES.some(
        (s) => statusName.toLowerCase() === s.toLowerCase()
      );
      return isResolved && updatedAt >= tenMinAgo;
    });

    consecutiveFailures = 0; // reset on successful API call

    if (recentIssues.length === 0) {
      console.log('[JiraPoller] No newly resolved issues found.');
      return [];
    }

    const newTriggers = [];

    for (const issue of recentIssues) {
      const key = issue.key;
      const fields = issue.fields || {};

      // Check if we already created a trigger for this issue (not dismissed)
      const existing = db.prepare(
        `SELECT id FROM pending_triggers WHERE jira_key = ? AND dismissed = 0`
      ).get(key);

      if (existing) continue;

      // Also skip if already decided
      const alreadyDecided = db.prepare(
        `SELECT id FROM pending_triggers WHERE jira_key = ? AND user_decision IS NOT NULL`
      ).get(key);

      if (alreadyDecided) continue;

      const trigger = {
        id: uuidv4(),
        jira_key: key,
        jira_summary: fields.summary || 'No summary',
        jira_type: fields.issuetype?.name || 'Issue',
        jira_status: fields.status?.name || 'Done',
        jira_priority: fields.priority?.name || 'Medium',
        jira_assignee: fields.assignee?.displayName || 'Unassigned',
        jira_url: `${config.jira.baseUrl}/browse/${key}`,
        previous_status: 'In Progress',
        event_type: fields.issuetype?.name === 'Bug' ? 'bug_fixed' : 'story_closed',
      };

      db.prepare(`
        INSERT INTO pending_triggers (id, jira_key, jira_summary, jira_type, jira_status, jira_priority, jira_assignee, jira_url, previous_status, event_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        trigger.id, trigger.jira_key, trigger.jira_summary, trigger.jira_type,
        trigger.jira_status, trigger.jira_priority, trigger.jira_assignee,
        trigger.jira_url, trigger.previous_status, trigger.event_type
      );

      newTriggers.push(trigger);
      console.log(`[JiraPoller] New trigger created for ${key}: ${trigger.jira_summary}`);
      kickOffCoverageAnalysis(trigger);
    }

    return newTriggers;
  } catch (err) {
    consecutiveFailures++;
    const status = err.response?.status;

    if (status === 410) {
      console.warn('[JiraPoller] Jira returned 410 — auto-polling disabled. Use manual triggers at /triggers.');
    } else if (status === 401 || status === 403) {
      console.warn('[JiraPoller] Jira auth error — check JIRA_EMAIL and JIRA_API_TOKEN in .env');
    } else {
      console.error('[JiraPoller] Poll error:', err.message);
    }

    if (consecutiveFailures >= MAX_FAILURES && pollerJob) {
      pollerJob.stop();
      pollerJob = null;
      console.warn('[JiraPoller] Auto-polling stopped after repeated failures. Manual triggers remain fully functional.');
    }

    return [];
  }
}

async function createManualTrigger(issueKey) {
  const db = getDatabase();
  try {
    const res = await jiraClient.get(`/issue/${issueKey}`, {
      params: { fields: 'summary,status,priority,assignee,issuetype' },
    });
    const issue = res.data;
    const fields = issue.fields || {};

    const existing = db.prepare(
      `SELECT id FROM pending_triggers WHERE jira_key = ? AND dismissed = 0 AND user_decision IS NULL`
    ).get(issueKey);

    if (existing) return { alreadyPending: true, triggerId: existing.id };

    const id = uuidv4();
    db.prepare(`
      INSERT INTO pending_triggers (id, jira_key, jira_summary, jira_type, jira_status, jira_priority, jira_assignee, jira_url, previous_status, event_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, issueKey,
      fields.summary || 'No summary',
      fields.issuetype?.name || 'Issue',
      fields.status?.name || 'Done',
      fields.priority?.name || 'Medium',
      fields.assignee?.displayName || 'Unassigned',
      `${config.jira.baseUrl}/browse/${issueKey}`,
      'In Progress',
      fields.issuetype?.name === 'Bug' ? 'bug_fixed' : 'story_closed'
    );

    kickOffCoverageAnalysis({ id, jira_key: issueKey, jira_type: fields.issuetype?.name || 'Issue' });
    return { created: true, triggerId: id };
  } catch (err) {
    console.error('[JiraPoller] createManualTrigger error:', err.message);
    throw err;
  }
}

// Fire-and-forget Coverage Intelligence Agent run for a newly-created trigger.
// Not awaited by callers — the poller's cron cadence and the manual-trigger
// HTTP response must not wait on a multi-second Claude call. The WHERE guard
// prevents a late-arriving analysis from overwriting a row the user already
// dismissed/decided while it was running.
function kickOffCoverageAnalysis(trigger) {
  const analysisTypes = config.jira.analysisIssueTypes.map((t) => t.toLowerCase());
  if (!analysisTypes.includes((trigger.jira_type || '').toLowerCase())) return;

  const coverageAgentService = require('./coverageAgent.service');
  coverageAgentService.analyzeIssue(trigger.jira_key)
    .then((report) => {
      const db = getDatabase();
      db.prepare(`
        UPDATE pending_triggers SET coverage_status = ?, coverage_analysis_id = ?, recommended_suite = ?, coverage_summary = ?
        WHERE id = ? AND dismissed = 0 AND user_decision IS NULL
      `).run(report.coverageStatusRaw, report.id, report.recommendedSuite, (report.aiRecommendation || '').slice(0, 200), trigger.id);
    })
    .catch((err) => console.error(`[JiraPoller] coverage analysis failed for ${trigger.jira_key}:`, err.message));
}

function getPendingTriggers() {
  const db = getDatabase();
  return db.prepare(
    `SELECT * FROM pending_triggers WHERE dismissed = 0 AND user_decision IS NULL ORDER BY created_at DESC`
  ).all();
}

function getTriggerHistory({ limit = 50 } = {}) {
  const db = getDatabase();
  return db.prepare(
    `SELECT * FROM pending_triggers ORDER BY created_at DESC LIMIT ?`
  ).all(limit);
}

async function respondToTrigger(triggerId, { decision, suite, customModules }) {
  const db = getDatabase();
  const trigger = db.prepare(`SELECT * FROM pending_triggers WHERE id = ?`).get(triggerId);
  if (!trigger) throw new Error('Trigger not found');

  if (decision === 'dismiss') {
    db.prepare(`UPDATE pending_triggers SET dismissed = 1, user_decision = 'dismissed', decided_at = CURRENT_TIMESTAMP WHERE id = ?`).run(triggerId);
    return { action: 'dismissed' };
  }

  // User chose to run tests — import testRunner here to avoid circular deps
  const { startTestRun } = require('./testRunner.service');
  const result = await startTestRun({
    suite: suite || 'full_regression',
    trigger: 'jira_trigger',
    jiraIssueKey: trigger.jira_key,
  });

  db.prepare(`
    UPDATE pending_triggers SET
      user_decision = ?, selected_suite = ?, run_id = ?, decided_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(decision, suite || 'full_regression', result.runId, triggerId);

  // Add comment back to Jira
  try {
    await jiraClient.post(`/issue/${trigger.jira_key}/comment`, {
      body: {
        type: 'doc', version: 1,
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: `🤖 AI QA Platform triggered a "${suite || 'full_regression'}" test run (Run ID: ${result.runId}) after this issue was resolved. Check results at: http://localhost:3002/runs/${result.runId}`,
          }],
        }],
      },
    });
  } catch (err) {
    console.warn('[JiraPoller] Could not post Jira comment:', err.message);
  }

  return { action: 'run_started', runId: result.runId, suite: suite || 'full_regression' };
}

function initializePoller() {
  if (pollerJob) pollerJob.stop();
  pollerJob = cron.schedule(POLL_INTERVAL, pollForResolvedIssues);
  console.log('[JiraPoller] Polling for resolved issues every 2 minutes');
  pollForResolvedIssues();
}

function stopPoller() {
  if (pollerJob) { pollerJob.stop(); pollerJob = null; }
}

module.exports = {
  initializePoller, stopPoller,
  pollForResolvedIssues, createManualTrigger,
  getPendingTriggers, getTriggerHistory, respondToTrigger,
};
