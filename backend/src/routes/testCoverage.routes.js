const express = require('express');
const router = express.Router();
const { analyzeCoverage, getLatestRecommendations, dismissRecommendation } = require('../services/coverageRecommendation.service');

router.post('/:key/analyze', async (req, res) => {
  try {
    const result = await analyzeCoverage({ jiraKey: req.params.key, triggerId: req.body?.triggerId });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:key', (req, res) => {
  try {
    const data = getLatestRecommendations(req.params.key);
    res.json({ success: true, data: data || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/recommendations/:id/dismiss', (req, res) => {
  try {
    res.json({ success: true, data: dismissRecommendation(req.params.id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
