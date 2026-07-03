const express = require('express');
const router = express.Router();
const { createSchedule, updateSchedule, deleteSchedule, getAllSchedules } = require('../services/scheduler.service');

router.get('/', (req, res) => {
  try {
    const schedules = getAllSchedules();
    res.json({ success: true, data: schedules });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, cronExpression, testSuite, enabled } = req.body;
    if (!name || !cronExpression) return res.status(400).json({ success: false, error: 'name and cronExpression required' });
    const schedule = createSchedule({ name, cronExpression, testSuite, enabled });
    res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const updated = updateSchedule(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    deleteSchedule(req.params.id);
    res.json({ success: true, message: 'Schedule deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
