const express = require('express');
const router = express.Router();
const { startTestRun, getRunById, getAllRuns, getTestStats } = require('../services/testRunner.service');
const { startPlaywrightRun } = require('../services/playwrightRunner.service');
const { getDatabase } = require('../config/database');

router.post('/', async (req, res) => {
  try {
    const { suite, trigger, branch, prNumber, jiraIssueKey, mode } = req.body;
    // mode='playwright' runs actual Playwright specs; default runs simulated runner
    let result;
    if (mode === 'playwright') {
      result = await startPlaywrightRun({ suite, trigger: trigger || 'manual', jiraIssueKey });
    } else {
      result = await startTestRun({ suite, trigger: trigger || 'manual', branch, prNumber, jiraIssueKey });
    }
    res.status(202).json({ success: true, data: result, message: 'Test run started successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await getAllRuns({ page: parseInt(page), limit: parseInt(limit) });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await getTestStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const run = await getRunById(req.params.id);
    if (!run) return res.status(404).json({ success: false, error: 'Run not found' });
    res.json({ success: true, data: run });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/test-cases', async (req, res) => {
  try {
    const db = getDatabase();
    const { status, module } = req.query;
    let query = 'SELECT * FROM test_cases WHERE run_id = ?';
    const params = [req.params.id];
    if (status) { query += ' AND status = ?'; params.push(status); }
    if (module) { query += ' AND module = ?'; params.push(module); }
    query += ' ORDER BY created_at';
    const cases = db.prepare(query).all(...params);
    res.json({ success: true, data: cases });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM healing_actions WHERE run_id = ?').run(req.params.id);
    db.prepare('DELETE FROM test_cases WHERE run_id = ?').run(req.params.id);
    db.prepare('DELETE FROM reports WHERE run_id = ?').run(req.params.id);
    db.prepare('DELETE FROM test_runs WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Run deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
