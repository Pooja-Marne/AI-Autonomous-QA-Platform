require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config/config');
const { getDatabase } = require('./config/database');
const { initializeScheduler } = require('./services/scheduler.service');
const { initializePoller } = require('./services/jiraPoller.service');
const { errorHandler, notFoundHandler, logger } = require('./middleware/errorHandler');

const testRunRoutes = require('./routes/testRun.routes');
const jiraRoutes = require('./routes/jira.routes');
const healingRoutes = require('./routes/healing.routes');
const reportsRoutes = require('./routes/reports.routes');
const schedulerRoutes = require('./routes/scheduler.routes');
const triggersRoutes = require('./routes/triggers.routes');
const coverageRoutes = require('./routes/coverage.routes');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.server.corsOrigin, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: { success: false, error: 'Too many requests' },
});
app.use('/api/', limiter);

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.server.nodeEnv,
  });
});

app.get('/api/status', (req, res) => {
  const db = getDatabase();
  const runs = db.prepare('SELECT COUNT(*) as count FROM test_runs').get();
  const healedCount = db.prepare("SELECT COUNT(*) as count FROM test_cases WHERE healing_status = 'healed'").get();
  res.json({
    success: true,
    data: {
      totalRuns: runs.count,
      totalHealed: healedCount.count,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  });
});

app.use('/api/runs', testRunRoutes);
app.use('/api/jira', jiraRoutes);
app.use('/api/healing', healingRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/scheduler', schedulerRoutes);
app.use('/api/triggers', triggersRoutes);
app.use('/api/coverage', coverageRoutes);

// Production deployment serves the built React app from this same process
// (single container/service — avoids CORS and a second public hostname).
// In local dev the frontend runs its own Vite dev server instead, so this
// is a no-op unless frontend/dist actually exists.
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api\/|\/health).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
  logger.info(`[Server] Serving built frontend from ${frontendDist}`);
}

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = config.server.port;

async function bootstrap() {
  try {
    getDatabase();
    logger.info('[DB] Connected and schema ready');
    initializeScheduler();
    logger.info('[Scheduler] Initialized');
    initializePoller();
    logger.info('[JiraPoller] Initialized');
    app.listen(PORT, () => {
      logger.info(`[Server] AI QA Platform running on http://localhost:${PORT}`);
      logger.info(`[Server] Environment: ${config.server.nodeEnv}`);
      logger.info('[Endpoints] /api/runs | /api/jira | /api/healing | /api/reports | /api/scheduler | /api/triggers | /api/coverage');
    });
  } catch (err) {
    logger.error('Bootstrap failed:', err);
    process.exit(1);
  }
}

bootstrap();
