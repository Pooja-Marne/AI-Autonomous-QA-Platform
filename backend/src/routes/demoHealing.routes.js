const express = require('express');
const router = express.Router();
const config = require('../config/config');
const { getDemoHealingRuns } = require('../services/demoHealingAgent.service');

router.get('/status', (req, res) => {
  res.json({ success: true, data: { demoMode: config.demoMode } });
});

router.get('/runs', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const data = getDemoHealingRuns({ limit: parseInt(limit) });
    res.json({ success: true, data, total: data.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
