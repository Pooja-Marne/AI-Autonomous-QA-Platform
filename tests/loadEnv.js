// Minimal .env loader shared by playwright.config.js and the backend's
// healing agent, so both read BASE_URL (and anything else added later) from
// exactly one file instead of each hardcoding their own copy. Avoids adding
// a dotenv dependency to tests/ — this is intentionally tiny.
const fs = require('fs');
const path = require('path');

// Named test.env, not .env — .env/**/.env is gitignored repo-wide, which
// would make this file silently vanish in the deployed container and leave
// BASE_URL unset. This file holds no secrets, only a base URL, so it's safe
// to commit under a name that isn't caught by that pattern.
function loadEnv(envPath = path.join(__dirname, 'test.env')) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

module.exports = { loadEnv };
