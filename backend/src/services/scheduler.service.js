const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../config/database');
const { startTestRun } = require('./testRunner.service');

const activeJobs = new Map();

function initializeScheduler() {
  const db = getDatabase();
  const configs = db.prepare('SELECT * FROM scheduler_config WHERE enabled = 1').all();
  
  for (const scheduleConfig of configs) {
    scheduleJob(scheduleConfig);
  }

  seedDefaultSchedules();
  console.log('[Scheduler] Initialized with', configs.length, 'active jobs');
}

function seedDefaultSchedules() {
  const db = getDatabase();
  const existing = db.prepare('SELECT COUNT(*) as count FROM scheduler_config').get();
  
  if (existing.count === 0) {
    const defaults = [
      { id: uuidv4(), name: 'Nightly Full Regression', cron_expression: '0 2 * * *', test_suite: 'full_regression', trigger_type: 'scheduled' },
      { id: uuidv4(), name: 'Hourly Smoke Test', cron_expression: '0 * * * *', test_suite: 'smoke', trigger_type: 'scheduled' },
      { id: uuidv4(), name: 'Daily API Tests', cron_expression: '0 9 * * 1-5', test_suite: 'api', trigger_type: 'scheduled' },
    ];

    const insert = db.prepare(`
      INSERT INTO scheduler_config (id, name, cron_expression, enabled, test_suite, trigger_type)
      VALUES (?, ?, ?, 1, ?, ?)
    `);
    defaults.forEach((d) => insert.run(d.id, d.name, d.cron_expression, d.test_suite, d.trigger_type));
    console.log('[Scheduler] Seeded', defaults.length, 'default schedules');
  }
}

function scheduleJob(scheduleConfig) {
  if (activeJobs.has(scheduleConfig.id)) {
    activeJobs.get(scheduleConfig.id).stop();
  }

  if (!cron.validate(scheduleConfig.cron_expression)) {
    console.error(`[Scheduler] Invalid cron: ${scheduleConfig.cron_expression}`);
    return false;
  }

  const job = cron.schedule(scheduleConfig.cron_expression, async () => {
    console.log(`[Scheduler] Triggering: ${scheduleConfig.name}`);
    try {
      await startTestRun({ suite: scheduleConfig.test_suite || 'full_regression', trigger: 'scheduled' });
      const db = getDatabase();
      db.prepare('UPDATE scheduler_config SET last_run = CURRENT_TIMESTAMP WHERE id = ?').run(scheduleConfig.id);
    } catch (err) {
      console.error(`[Scheduler] Job failed: ${scheduleConfig.name}`, err.message);
    }
  });

  activeJobs.set(scheduleConfig.id, job);
  return true;
}

function createSchedule({ name, cronExpression, testSuite, enabled = true }) {
  if (!cron.validate(cronExpression)) throw new Error(`Invalid cron expression: ${cronExpression}`);

  const db = getDatabase();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO scheduler_config (id, name, cron_expression, enabled, test_suite, trigger_type)
    VALUES (?, ?, ?, ?, ?, 'scheduled')
  `).run(id, name, cronExpression, enabled ? 1 : 0, testSuite);

  if (enabled) {
    const config = db.prepare('SELECT * FROM scheduler_config WHERE id = ?').get(id);
    scheduleJob(config);
  }

  return { id, name, cronExpression, testSuite, enabled };
}

function updateSchedule(id, updates) {
  const db = getDatabase();
  const fields = Object.entries(updates).map(([k, v]) => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), id];
  db.prepare(`UPDATE scheduler_config SET ${fields} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM scheduler_config WHERE id = ?').get(id);
  if (updated.enabled) scheduleJob(updated);
  else if (activeJobs.has(id)) { activeJobs.get(id).stop(); activeJobs.delete(id); }

  return updated;
}

function deleteSchedule(id) {
  if (activeJobs.has(id)) { activeJobs.get(id).stop(); activeJobs.delete(id); }
  const db = getDatabase();
  db.prepare('DELETE FROM scheduler_config WHERE id = ?').run(id);
}

function getAllSchedules() {
  const db = getDatabase();
  return db.prepare('SELECT * FROM scheduler_config ORDER BY created_at').all().map((s) => ({
    ...s,
    enabled: Boolean(s.enabled),
    isRunning: activeJobs.has(s.id),
  }));
}

module.exports = { initializeScheduler, scheduleJob, createSchedule, updateSchedule, deleteSchedule, getAllSchedules };
