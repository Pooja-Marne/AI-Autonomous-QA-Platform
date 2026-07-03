const express = require('express');
const router = express.Router();
const { fetchLatestCommits, fetchOpenPRs, fetchBranches, fetchChangedFilesForPR, fetchRepoInfo } = require('../services/github.service');

router.get('/info', async (req, res) => {
  try {
    const info = await fetchRepoInfo();
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/commits', async (req, res) => {
  try {
    const { branch, count = 20 } = req.query;
    const commits = await fetchLatestCommits(branch, parseInt(count));
    res.json({ success: true, data: commits });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/prs', async (req, res) => {
  try {
    const prs = await fetchOpenPRs();
    res.json({ success: true, data: prs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/prs/:number/files', async (req, res) => {
  try {
    const files = await fetchChangedFilesForPR(parseInt(req.params.number));
    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/branches', async (req, res) => {
  try {
    const branches = await fetchBranches();
    res.json({ success: true, data: branches });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
