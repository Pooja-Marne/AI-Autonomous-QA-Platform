const axios = require('axios');
const config = require('../config/config');

async function sendSlackNotification({ runId, name, status, passed, failed, healed, notFixable, total }) {
  if (!config.slack.webhookUrl) return;

  const statusColor = status === 'passed' ? '#36a64f' : status === 'partially_healed' ? '#ff9f1c' : '#e01e5a';
  const statusEmoji = status === 'passed' ? ':white_check_mark:' : status === 'partially_healed' ? ':wrench:' : ':x:';

  const payload = {
    attachments: [
      {
        color: statusColor,
        pretext: `${statusEmoji} *AI QA Platform - Test Run ${status.toUpperCase().replace('_', ' ')}*`,
        title: name,
        title_link: `${config.server.corsOrigin}/runs/${runId}`,
        fields: [
          { title: 'Total Tests', value: String(total), short: true },
          { title: 'Passed', value: `✅ ${passed}`, short: true },
          { title: 'Failed', value: `❌ ${failed}`, short: true },
          { title: 'AI Healed', value: `🔧 ${healed}`, short: true },
          { title: 'Not Fixable', value: `🚫 ${notFixable}`, short: true },
          { title: 'Pass Rate', value: `${total ? ((passed / total) * 100).toFixed(1) : 0}%`, short: true },
        ],
        footer: 'AI Autonomous QA Platform',
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  await axios.post(config.slack.webhookUrl, payload);
}

async function sendHealingAlert({ testCaseName, failureType, healingStatus, suggestion }) {
  if (!config.slack.webhookUrl) return;

  const emoji = healingStatus === 'healed' ? ':wrench:' : ':warning:';
  const color = healingStatus === 'healed' ? '#36a64f' : '#ff9f1c';

  await axios.post(config.slack.webhookUrl, {
    attachments: [{
      color,
      pretext: `${emoji} *AI Self-Healing Alert*`,
      fields: [
        { title: 'Test Case', value: testCaseName, short: false },
        { title: 'Failure Type', value: failureType, short: true },
        { title: 'Healing Status', value: healingStatus, short: true },
        { title: 'AI Suggestion', value: suggestion || 'N/A', short: false },
      ],
    }],
  });
}

module.exports = { sendSlackNotification, sendHealingAlert };
