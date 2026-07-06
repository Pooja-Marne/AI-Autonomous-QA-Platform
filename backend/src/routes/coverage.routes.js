const express = require('express');
const router = express.Router();
const coverageAgentService = require('../services/coverageAgent.service');

router.get('/analyses', (req, res) => {
  try {
    const { sprint, status } = req.query;
    const data = coverageAgentService.getStoredAnalyses({ sprint, status });
    res.json({ success: true, data, total: data.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/analyses/:jiraKey', async (req, res) => {
  try {
    const { jiraKey } = req.params;
    const refresh = req.query.refresh === 'true';
    let data = refresh ? null : coverageAgentService.getStoredAnalysis(jiraKey);
    if (!data) data = await coverageAgentService.analyzeIssue(jiraKey);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/analyze', async (req, res) => {
  try {
    const { jiraKey } = req.body;
    if (!jiraKey) return res.status(400).json({ success: false, error: 'jiraKey is required' });
    const data = await coverageAgentService.analyzeIssue(jiraKey);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/analyze-sprint', (req, res) => {
  const status = coverageAgentService.getStatus();
  if (status.running) {
    return res.status(409).json({ success: false, error: 'A sprint analysis is already running', data: status });
  }

  coverageAgentService.analyzeAndSummarizeSprint()
    .catch((err) => console.error('[Coverage] analyzeAndSummarizeSprint error:', err.message));

  res.status(202).json({ success: true, data: { status: 'started' } });
});

router.get('/status', (req, res) => {
  res.json({ success: true, data: coverageAgentService.getStatus() });
});

router.get('/sprint-summary', (req, res) => {
  try {
    const { sprint } = req.query;
    const data = coverageAgentService.getLatestSprintSummary(sprint);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
