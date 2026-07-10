const express = require('express');
const router = express.Router();
const { getDemoHealingRuns } = require('../services/demoHealingAgent.service');

// History of real self-healing cycles — screenshot/trace/DOM artifacts,
// locator diff, confidence, root cause, retry result — feeds the AI Healing
// dashboard's runtime logs and healing timeline.
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
