const express = require('express');
const router = express.Router();
const { getReportByRunId, generateReport, getAnalytics } = require('../services/reporting.service');
const { getDatabase } = require('../config/database');

router.get('/analytics', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const analytics = await getAnalytics({ days: parseInt(days) });
    res.json({ success: true, data: analytics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', (req, res) => {
  const db = getDatabase();
  const reports = db.prepare(`
    SELECT r.*, tr.name as run_name, tr.status as run_status, tr.total_tests, tr.passed, tr.failed, tr.healed
    FROM reports r LEFT JOIN test_runs tr ON r.run_id = tr.id
    ORDER BY r.generated_at DESC LIMIT 50
  `).all();
  res.json({ success: true, data: reports });
});

router.get('/:runId', async (req, res) => {
  try {
    const report = await getReportByRunId(req.params.runId);
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/generate/:runId', async (req, res) => {
  try {
    const report = await generateReport(req.params.runId);
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
