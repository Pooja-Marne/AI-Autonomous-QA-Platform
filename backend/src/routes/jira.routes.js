const express = require('express');
const router = express.Router();
const { fetchActiveSprintIssues, fetchBugsAndFailures, fetchAllIssues, createJiraIssue, addCommentToIssue } = require('../services/jira.service');
const { getDatabase } = require('../config/database');
const config = require('../config/config');

const toJiraUrl = (key) => key ? `${config.jira.baseUrl}/browse/${key}` : null;
const normaliseRow = (row) => ({ ...row, url: toJiraUrl(row.key), issue_type: row.type });

router.get('/sprint', async (req, res) => {
  try {
    const data = await fetchActiveSprintIssues();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/bugs', async (req, res) => {
  try {
    const bugs = await fetchBugsAndFailures();
    res.json({ success: true, data: bugs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/issues', async (req, res) => {
  try {
    const result = await fetchAllIssues();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/cached', (req, res) => {
  const db = getDatabase();
  const issues = db.prepare('SELECT * FROM jira_issues ORDER BY fetched_at DESC LIMIT 100').all().map(normaliseRow);
  res.json({ success: true, data: issues });
});

// Return all issues with status Done/Closed/Resolved with full metadata
router.get('/closed', async (req, res) => {
  try {
    // Refresh from Jira first so we get the latest statuses
    await fetchAllIssues().catch(() => null);
    const db = getDatabase();
    const closed = db.prepare(`
      SELECT * FROM jira_issues
      WHERE LOWER(status) IN ('done', 'closed', 'resolved')
      ORDER BY fetched_at DESC
      LIMIT 50
    `).all().map(normaliseRow);
    res.json({ success: true, data: closed, total: closed.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Return recent failed test cases for bug creation
router.get('/failed-tests', (req, res) => {
  try {
    const db = getDatabase();
    const failed = db.prepare(`
      SELECT
        tc.id, tc.name, tc.module, tc.status, tc.error_message,
        tc.failure_type, tc.file_path, tc.run_id,
        tc.created_at, tc.healing_status, tc.healing_action,
        r.name as run_name, r.trigger_type as run_suite, r.created_at as run_date
      FROM test_cases tc
      LEFT JOIN test_runs r ON tc.run_id = r.id
      WHERE tc.status IN ('failed', 'not_fixable')
      ORDER BY tc.created_at DESC
      LIMIT 50
    `).all();
    res.json({ success: true, data: failed, total: failed.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/issues', async (req, res) => {
  try {
    const { summary, description, issueType, priority } = req.body;
    if (!summary) return res.status(400).json({ success: false, error: 'Summary is required' });
    const issue = await createJiraIssue({ summary, description, issueType, priority });
    res.status(201).json({ success: true, data: issue });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/issues/:key/comment', async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ success: false, error: 'Comment is required' });
    const result = await addCommentToIssue(req.params.key, comment);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
