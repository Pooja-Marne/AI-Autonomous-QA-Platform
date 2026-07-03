# AI Autonomous QA Platform

An AI-powered self-healing QA automation platform that integrates with **Jira**, **GitHub**, executes regression tests, and uses **GPT-4.1** to detect and heal test failures automatically.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React Dashboard (Port 3002)           │
│  Dashboard | Test Runs | Analytics | Healing | Jira | GitHub │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP / REST API
┌────────────────────▼────────────────────────────────────┐
│               Express Backend (Port 3001)                │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │Test Runner  │  │ AI Healing   │  │   Scheduler   │  │
│  │  Service    │  │  Service     │  │  (node-cron)  │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────────┘  │
│         │                │                              │
│  ┌──────▼──────────────▼─────────────────────────────┐ │
│  │           Integration Services                     │ │
│  │  Jira API    │   GitHub API   │   Slack Webhook   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │              SQLite Database                        │ │
│  │  test_runs | test_cases | healing_actions | reports │ │
│  └─────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Features

- **Jira Integration**: Fetch active sprint issues, bugs, sync with test cases
- **GitHub Integration**: Fetch commits, PRs, detect impacted modules for selective testing
- **Regression Engine**: Full / Smoke / API / UI test suites with cron scheduling
- **AI Self-Healing**: GPT-4.1 classifies failures (locator/API/data/env/timeout) and auto-heals
- **Reporting**: Per-run reports with root cause analysis, Jira & Git links
- **Slack Notifications**: Run completion alerts with pass/fail/healed counts
- **Dashboard UI**: Real-time dashboard with analytics, charts, healing center

## Quick Start

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

### 2. Start Backend

```bash
cd backend
npm run dev
# Runs on http://localhost:3001
```

### 3. Start Frontend

```bash
cd frontend
npm run dev
# Opens http://localhost:3002
```

### 4. Trigger Your First Test Run

Open the dashboard at http://localhost:3002 and click **"Run Tests"**.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/runs` | Start a new test run |
| GET | `/api/runs` | List all test runs |
| GET | `/api/runs/:id` | Get run details with test cases |
| GET | `/api/runs/stats` | Overall statistics |
| GET | `/api/jira/sprint` | Fetch active sprint issues |
| GET | `/api/jira/bugs` | Fetch open bugs |
| GET | `/api/github/commits` | Fetch recent commits |
| GET | `/api/github/prs` | Fetch open PRs |
| POST | `/api/healing/analyze` | Analyze a failure with AI |
| POST | `/api/healing/heal/:id` | Trigger healing for a test case |
| GET | `/api/reports/analytics` | Get analytics data |
| GET/POST | `/api/scheduler` | Manage cron schedules |

## Test Suites

| Suite | Cases | Modules |
|-------|-------|---------|
| `full_regression` | ~28 | auth, dashboard, api, database, ui, services |
| `smoke` | ~3 | ui, api (critical paths) |
| `api` | ~7 | api, services |
| `ui` | ~5 | ui, dashboard |

## AI Healing Flow

```
Test Fails
    ↓
AI Classifies: locator_issue | api_mismatch | data_issue | environment_issue | timeout
    ↓
AI Generates Healing Plan (selector fix, retry strategy, data refresh, etc.)
    ↓
Apply Fix → Re-verify
    ↓
Status: "Healed" ✅  OR  "Not Fixable" ❌
```

## Environment Variables

See `backend/.env` for all configuration. Key variables:

- `OPENAI_API_KEY` / `OPENAI_BASE_URL` - GitHub Models or OpenAI
- `JIRA_BASE_URL` / `JIRA_EMAIL` / `JIRA_API_TOKEN` - Jira Cloud
- `GITHUB_TOKEN` / `GITHUB_OWNER` / `GITHUB_REPO` - GitHub repo
- `SLACK_WEBHOOK_URL` - Slack notifications
- `DATABASE_PATH` - SQLite file path

## Database Schema

- `test_runs` - Run metadata, status, counts
- `test_cases` - Individual test results with healing info
- `healing_actions` - AI healing attempts with analysis
- `jira_issues` - Cached Jira issues
- `git_changes` - Cached commits/PRs
- `scheduler_config` - Cron schedule definitions
- `reports` - Generated reports per run
