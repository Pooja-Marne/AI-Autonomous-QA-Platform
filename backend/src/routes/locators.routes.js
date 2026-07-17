const express = require('express');
const router = express.Router();
const {
  listActiveLocators, listResolvedLocators, approveLocator, rejectLocator, getLocatorById,
  deleteLocator, clearAllLocators,
} = require('../services/locatorRepository.service');
const { isConfigured: gitConfigured } = require('../services/gitIntegration.service');

router.get('/', async (req, res) => {
  try {
    res.json({
      success: true,
      data: listActiveLocators(),
      resolved: listResolvedLocators(),
      gitIntegrationConfigured: gitConfigured(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Registered before /:id so it isn't shadowed by the param route below.
router.delete('/clear', async (req, res) => {
  try {
    res.json({ success: true, data: clearAllLocators() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/reset', async (req, res) => {
  try {
    res.json({ success: true, data: clearAllLocators() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const locator = getLocatorById(req.params.id);
    if (!locator) return res.status(404).json({ success: false, error: 'Locator not found' });
    res.json({ success: true, data: locator });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const result = await approveLocator(req.params.id, { approvedBy: req.body?.approvedBy });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const result = rejectLocator(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = deleteLocator(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Locator not found' });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
