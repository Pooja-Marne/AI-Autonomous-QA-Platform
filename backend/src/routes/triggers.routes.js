const express = require('express');
const router = express.Router();
const {
  getPendingTriggers, getTriggerHistory, respondToTrigger,
  createManualTrigger, pollForResolvedIssues,
} = require('../services/jiraPoller.service');

// GET all pending triggers waiting for user decision
router.get('/pending', (req, res) => {
  try {
    const triggers = getPendingTriggers();
    res.json({ success: true, data: triggers, count: triggers.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET full trigger history
router.get('/history', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const history = getTriggerHistory({ limit: parseInt(limit) });
    res.json({ success: true, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST respond to a trigger (run suite or dismiss)
router.post('/:id/respond', async (req, res) => {
  try {
    const { decision, suite, customModules } = req.body;
    if (!decision) return res.status(400).json({ success: false, error: 'decision is required' });

    const result = await respondToTrigger(req.params.id, { decision, suite, customModules });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST manually create a trigger for a specific Jira issue key
router.post('/manual', async (req, res) => {
  try {
    const { issueKey } = req.body;
    if (!issueKey) return res.status(400).json({ success: false, error: 'issueKey is required' });
    const result = await createManualTrigger(issueKey);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST force a Jira poll immediately
router.post('/poll', async (req, res) => {
  try {
    const newTriggers = await pollForResolvedIssues();
    res.json({ success: true, data: { newTriggers, count: newTriggers.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
