require('dotenv').config();
const path = require('path');

module.exports = {
  server: {
    port: process.env.PORT || 3001,
    nodeEnv: process.env.NODE_ENV || 'development',
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3002',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4.1',
    baseURL: process.env.OPENAI_BASE_URL || 'https://models.inference.ai.azure.com',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
  },
  jira: {
    baseUrl: process.env.JIRA_BASE_URL,
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
    projectKey: process.env.JIRA_PROJECT_KEY || 'SCRUM',
    testableStatuses: (process.env.JIRA_TESTABLE_STATUSES || 'Done,Closed,Resolved,Ready for Testing')
      .split(',').map((s) => s.trim()).filter(Boolean),
  },
  automation: {
    repoPath: process.env.AUTOMATION_REPO_PATH || path.resolve(__dirname, '..', '..', '..', 'tests'),
  },
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
  },
  database: {
    path: process.env.DATABASE_PATH || './data/intelligence.db',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  },
};
