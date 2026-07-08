const express = require('express');
const router = express.Router();
const { healTestCase, getHealingStats, classifyFailure } = require('../services/aiHealing.service');
const { runRealHealingCycle, findBrokenLocatorInMessage } = require('../services/demoHealingAgent.service');
const { getDatabase } = require('../config/database');
const config = require('../config/config');

const jiraUrl = (key) => key ? `${config.jira.baseUrl}/browse/${key}` : null;

router.post('/analyze', async (req, res) => {
  try {
    const { name, errorMessage, stackTrace, filePath } = req.body;
    if (!errorMessage) return res.status(400).json({ success: false, error: 'errorMessage is required' });

    // If the error message contains a locator we can actually recognize and
    // fix, run the real pipeline (live DOM, real AI, real retry) instead of
    // just producing a text diagnosis — "Fix with AI" should try to really
    // fix it whenever that's possible.
    const match = findBrokenLocatorInMessage(errorMessage);
    if (match) {
      const result = await runRealHealingCycle({
        locatorKey: match.locatorKey, testFile: filePath, failedTestNames: name ? [name] : [],
      });
      if (result) {
        return res.json({
          success: true,
          data: {
            real: true,
            failureType: 'locator_issue',
            healingStatus: result.healingStatus,
            fixed: result.healingStatus === 'healed',
            confidence: (result.confidenceScore || 0) / 100,
            reasoning: result.rootCause,
            oldLocator: result.oldLocator,
            newLocator: result.newLocator,
            codeSnippet: result.codeSnippet,
            liveVerified: result.liveVerified,
            retryStatus: result.retryStatus,
            suggestedFix: result.newLocator
              ? `Replace ${result.oldLocator} with ${result.newLocator}`
              : 'AI could not confidently verify a replacement locator against the live app.',
            canAutoHeal: result.healingStatus === 'healed',
          },
        });
      }
    }

    // No recognized locator to really fix — fall back to a text-only
    // diagnosis, but be explicit that this is a diagnosis, not a fix.
    const analysis = await classifyFailure({ name: name || 'unknown', errorMessage, stackTrace, filePathTest: filePath });
    res.json({
      success: true,
      data: {
        real: false,
        ...analysis,
        fixed: false,
        note: 'This error doesn\'t match a locator the live self-healing agent recognizes, so this is a diagnosis only — no live retry was performed.',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/heal/:testCaseId', async (req, res) => {
  try {
    const db = getDatabase();
    const tc = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(req.params.testCaseId);
    if (!tc) return res.status(404).json({ success: false, error: 'Test case not found' });
    const result = await healTestCase({
      ...tc,
      runId: tc.run_id,
      errorMessage: tc.error_message,
      stackTrace: tc.stack_trace,
      originalSelector: tc.original_selector,
      jiraIssueKey: tc.jira_issue_key,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const { runId } = req.query;
    const stats = await getHealingStats(runId);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/actions', (req, res) => {
  const db = getDatabase();
  const { runId, limit = 50, jiraOnly } = req.query;

  let query = `
    SELECT
      ha.*,
      tc.name         AS test_case_name,
      tc.module       AS test_case_module,
      tc.jira_issue_key,
      tc.file_path    AS test_file_path,
      ji.summary      AS jira_summary,
      ji.status       AS jira_status,
      ji.priority     AS jira_priority,
      ji.assignee     AS jira_assignee,
      ji.type         AS jira_type,
      ji.description  AS jira_description,
      r.name          AS run_name
    FROM healing_actions ha
    LEFT JOIN test_cases  tc ON ha.test_case_id = tc.id
    LEFT JOIN jira_issues ji ON tc.jira_issue_key = ji.key
    LEFT JOIN test_runs   r  ON ha.run_id = r.id
  `;

  const conditions = [];
  const params = [];

  if (runId) { conditions.push('ha.run_id = ?'); params.push(runId); }
  if (jiraOnly === 'true') { conditions.push('tc.jira_issue_key IS NOT NULL'); }

  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY ha.created_at DESC LIMIT ?';
  params.push(parseInt(limit));

  const actions = db.prepare(query).all(...params).map((a) => ({
    ...a,
    jira_url: jiraUrl(a.jira_issue_key),
  }));
  res.json({ success: true, data: actions, total: actions.length });
});

module.exports = router;
