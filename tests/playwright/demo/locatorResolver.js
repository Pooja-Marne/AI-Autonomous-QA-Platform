const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'demoLocators.json');
const DEMO_MODE = process.env.DEMO_MODE === 'true';

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Resolves the selector a page object should use for `key`.
 * - DEMO_MODE=false: always the real, working selector — normal execution.
 * - DEMO_MODE=true, no healed override yet: the intentionally-broken selector.
 * - DEMO_MODE=true, healed override present: the AI-generated selector, used
 *   only for the single retry run the healing agent triggers — the agent
 *   clears the override again right after, so the next full run reproduces
 *   the same failure for the next demo.
 */
function resolve(key) {
  const entry = loadConfig()[key];
  if (!entry) throw new Error(`No demo locator entry for "${key}" in demoLocators.json`);
  if (!DEMO_MODE) return entry.working;
  return entry.healed || entry.broken;
}

module.exports = { resolve, DEMO_MODE, CONFIG_PATH };
