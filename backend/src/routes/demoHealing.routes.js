const express = require('express');
const router = express.Router();
const config = require('../config/config');
const { getDemoHealingRuns, resetDemoLocators, getLocatorsStatus } = require('../services/demoHealingAgent.service');

router.get('/status', (req, res) => {
  res.json({ success: true, data: { demoMode: config.demoMode } });
});

router.get('/locators', (req, res) => {
  try {
    res.json({ success: true, data: getLocatorsStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
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

// Clears any applied ("healed") locator overrides so the bait locators go
// back to broken for another live demo run.
router.post('/reset', (req, res) => {
  try {
    const data = resetDemoLocators();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
