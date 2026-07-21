# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An AI-powered, self-healing QA automation platform. It integrates with Jira and GitHub, runs a real Playwright suite against a *separately deployed* demo site, and uses an LLM to classify test failures and auto-heal broken locators — with a human approving before anything is committed or merged.

The repo is three independent Node/npm projects, run as separate processes in dev:

| Dir | What | Port |
|---|---|---|
| `backend/` | Express API + SQLite (`node:sqlite`) + all AI/Jira/GitHub integration logic | 3001 |
| `frontend/` | React + Vite + Tailwind dashboard (talks to the backend API) | 3002 |
| `tests/` | The Playwright suite that actually gets executed — specs, Page Objects, fixtures | n/a (spawned as a subprocess) |

**`tests/` does not test this repo's own frontend.** Its `baseURL` (`BASE_URL` env, default `http://localhost:8080`) points at a separate deployed "AI Healing Demo Site" (a different app entirely). The dashboard in `frontend/` is the *control plane* for running/healing that external site's tests, not the thing under test.

## Commands

Install once per subproject: `npm install` in `backend/`, `frontend/`, and `tests/`.

**Backend** (`backend/`)
- `npm run dev` — nodemon, http://localhost:3001
- `npm start` — plain node (production)
- `npm test` — runs `node:test` over `src/**/*.test.js` (currently just `src/utils/withTimeout.test.js`)
- Note: the `seed` script in `package.json` (`node src/database/seed.js`) references a file that doesn't exist — don't rely on it.

**Frontend** (`frontend/`)
- `npm run dev` — Vite dev server, http://localhost:3002
- `npm run build` — production build to `frontend/dist`
- No lint/test scripts exist in this project.

**Tests** (`tests/`) — the actual Playwright suite under test
- `npm test` — runs the full suite (`playwright test`)
- `npm run test:headed` / `npm run test:ui` — headed / UI mode
- `npm run test:auth` / `test:dashboard` / `test:navigation` / `test:orders` / `test:products` / `test:users` — one spec file at a time
- Single test by name: `npx playwright test --grep "test name substring"`
- `npm run report` — open the last HTML report
- `npm run codegen` — Playwright codegen against `http://localhost:8080`
- Config: `tests/playwright.config.js` — `fullyParallel: false`, 1 retry everywhere (the target site is reached over a real network hop, not localhost, so retries absorb genuine network jitter), only the `chromium` project is defined/installed.
- `tests/loadEnv.js` + `tests/test.env` supply `BASE_URL` and friends; loaded automatically by `playwright.config.js`.

There is no root-level `package.json` — always `cd` into the specific subproject first.

## Architecture

### The closed loop (the thing to understand before touching any AI/Jira code)

```
Jira issue resolved (polled every 15s)
  → AI recommends a suite (full_regression | regression | smoke) + reason
  → human approves via dashboard "pending trigger" prompt
  → real Playwright run spawned as a subprocess against the demo site
  → on failure: AI classifies failure type, then (if locator-addressable)
    resolves a replacement selector against the live DOM/screenshot
  → fix is written to the Locator Repository (SQLite) as `pending_approval`
  → human approves → PR opened against the demo site's Page Object source
  → PR merge is polled → row flips to `resolved`; comment posted back to the
    Jira issue with the run result
```

Every step of this is backed by its own service in `backend/src/services/`; there is no single "orchestrator" file — read `jiraPoller.service.js` → `playwrightRunner.service.js` → `demoHealingAgent.service.js` → `locatorRepository.service.js` → `gitIntegration.service.js` → `githubMergePoller.service.js` in that order to follow one full cycle.

### Three distinct Jira-facing pieces (don't conflate them)

- **`jira.service.js`** — plain Jira Cloud REST wrapper (sprint issues, bugs, create issue/comment). No AI. Everything else below reads from its SQLite cache (`jira_issues` table) as a fallback when Jira is unreachable.
- **`jiraPoller.service.js`** — cron-polls for newly resolved issues and asks the LLM which *suite* to run. Owns `pending_triggers`.
- **`coverageRecommendation.service.js`** — separately callable; given a Jira issue, reads the *entire* current Playwright spec inventory (`specInventory.service.js`) and asks the LLM which specific test *scenarios* the issue needs and whether each already exists, by meaning rather than string match. Owns `test_case_recommendations`.

### The Locator Repository is the single source of truth for healed selectors

`locator_repository` (SQLite) is append-only — every healing attempt is a new row (version = row count for that `page_object`+`property_name` pair), never an update. `locatorRepository.service.js` regenerates `tests/playwright/locators/resolved-locators.json` on every write; every Page Object's `resolve()` call (`tests/playwright/locators/resolve.js`) reads *that JSON file*, not the database directly — this is what makes terminal execution, the dashboard, Jira-triggered runs, and the scheduler all resolve locators identically regardless of which process healed them.

On every backend boot, `checkAndInvalidateOnVersionChange()` compares the current app version (`RAILWAY_GIT_COMMIT_SHA`, or local git HEAD) against the last-known version stored in `app_version_state`. If it changed (new deploy or merged PR), every currently-active locator fix is re-checked against the actual source: confirmed-in-source → `resolved`, not-yet-confirmed → `superseded_by_deploy`. This is what prevents a stale fix, verified against an old build, from silently resolving forever.

### Two LLM providers, not symmetric

`config.openai` (GPT-4.1 by default, via `OPENAI_BASE_URL`) is primary everywhere. `config.anthropic` (Claude, via `ANTHROPIC_API_KEY`) is *only* used as an automatic fallback inside `demoHealingAgent.service.js`'s live locator-resolution loop (`analyzeWithOpenAI` → falls back to `analyzeWithClaude` on error) — it is not wired into the Jira-facing agents or the older `aiHealing.service.js` classifier.

### Human-approval gates

Nothing autonomous ever executes tests or merges code without an explicit approval step: a Jira-triggered suite recommendation sits in `pending_triggers` until a user picks a suite (or dismisses it); a healed locator sits `pending_approval` in `locator_repository` until a user approves it (which is what actually calls `gitIntegration.service.js` to open the PR).

### Database

`node:sqlite` (`DatabaseSync`), file path from `DATABASE_PATH` (default `./data/intelligence.db`), WAL mode. Schema lives entirely in `backend/src/config/database.js`'s `initializeSchema()`, including hand-written additive migrations (`ALTER TABLE ... ADD COLUMN` guarded by `PRAGMA table_info`) rather than a migration framework — when adding a column to an existing table, follow that same pattern rather than editing the `CREATE TABLE` alone.

### Config and key env vars

All environment access is centralized in `backend/src/config/config.js` — don't read `process.env` elsewhere. Notable vars: `OPENAI_API_KEY`/`OPENAI_MODEL`/`OPENAI_BASE_URL`, `ANTHROPIC_API_KEY`/`CLAUDE_MODEL`, `JIRA_BASE_URL`/`JIRA_EMAIL`/`JIRA_API_TOKEN`/`JIRA_PROJECT_KEY`/`JIRA_TESTABLE_STATUSES`, `JIRA_POLL_INTERVAL` (defaults to a 15s demo-friendly cadence, not production-cheap), `GITHUB_TOKEN`/`GITHUB_OWNER`/`GITHUB_REPO`, `SLACK_WEBHOOK_URL`, `AUTOMATION_REPO_PATH` (defaults to the sibling `tests/` dir — this is how the backend finds the Playwright suite to spawn), `DATABASE_PATH`.

### Deployment

Single Docker image (see `Dockerfile`): builds `frontend/` and copies the static output, `npm ci`s `backend/`, and *also* installs the `tests/` Playwright deps + `chromium` only (pinned to match `playwrightRunner.service.js`/`demoHealingAgent.service.js`, which hardcode `--project=chromium`) — the real spec files ship inside the deployed image and get executed for real, not mocked. Deployed on Railway (`railway.json`), health-checked at `/health`. In production the backend also serves the built frontend directly (see the `frontend/dist` static-serving block in `backend/src/index.js`) so it's one process/one service; in dev they're two separate servers on 3001/3002 with CORS enabled between them.
