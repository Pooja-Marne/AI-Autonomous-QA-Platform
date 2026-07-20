const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const SPECS_DIR = path.join(config.automation.repoPath, 'playwright', 'specs');

// Every spec file observed to date wraps ALL its tests in exactly one
// top-level test.describe(...) (see tests/playwright/specs/*.spec.js) — take
// the first describe name as the file's module label. Falls back to the
// filename if a file has no describe block at all. If a future spec file
// nests multiple test.describe blocks, tests after the first would be
// mis-attributed to the first describe's name — acceptable for v1 since
// no current spec does this.
const DESCRIBE_RE = /test\.describe(?:\.only|\.serial)?\(\s*(['"`])((?:(?!\1)[\s\S])*?)\1/;
const TEST_RE = /\btest(?:\.only|\.skip|\.fixme)?\(\s*(['"`])((?:(?!\1)[\s\S])*?)\1/g;
const TAG_RE = /@[\w-]+/g;

function listExistingTests() {
  if (!fs.existsSync(SPECS_DIR)) return [];
  const files = fs.readdirSync(SPECS_DIR).filter((f) => f.endsWith('.spec.js'));
  const tests = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(SPECS_DIR, file), 'utf-8');
    const module = file.replace(/\.spec\.js$/, '');
    const describeMatch = content.match(DESCRIBE_RE);
    const describeName = describeMatch ? describeMatch[2] : module;

    for (const m of content.matchAll(TEST_RE)) {
      const raw = m[2];
      const tags = raw.match(TAG_RE) || [];
      const title = raw.replace(TAG_RE, '').trim();
      tests.push({ module, describeName, title, tags, fullTitle: `${describeName} > ${title}` });
    }
  }
  return tests;
}

function formatExistingTestsForPrompt(tests) {
  const byModule = {};
  for (const t of tests) {
    if (!byModule[t.module]) byModule[t.module] = [];
    byModule[t.module].push(`${t.describeName} > ${t.title} [${t.tags.join(' ')}]`);
  }
  return Object.entries(byModule)
    .map(([mod, list]) => `${mod}:\n  - ${list.join('\n  - ')}`)
    .join('\n');
}

module.exports = { listExistingTests, formatExistingTestsForPrompt, SPECS_DIR };
