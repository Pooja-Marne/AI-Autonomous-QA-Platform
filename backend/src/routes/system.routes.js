const express = require('express');
const router = express.Router();
const { getSourceSyncStatus } = require('../services/sourceInfo.service');

router.get('/source-info', async (req, res) => {
  try {
    res.json({ success: true, data: await getSourceSyncStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
