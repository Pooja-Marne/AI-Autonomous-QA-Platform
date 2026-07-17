const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const PAGES_DIR = path.join(config.automation.repoPath, 'playwright', 'pages');

// Shared regex for the `resolve('ClassName.property', 'value')` call shape
// every Page Object wraps its locators in (see tests/playwright/locators/resolve.js).
// Used both to look up a property by its current value and to check what
// value a specific property currently holds in source.
function buildResolveCallRegex({ pageObject, propertyName, value } = {}) {
  // Escaped the same way `value` already was below — pageObject/propertyName
  // only ever come from \w+-matched source in practice, so this is
  // defensive rather than fixing an observed bug, but batch operations
  // (approveLocatorsBatch) raise the blast radius of any future edge case.
  const cls = pageObject ? pageObject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '\\w+';
  const prop = propertyName ? propertyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '\\w+';
  const val = value !== undefined
    ? value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    : '.*?';
  return new RegExp(`resolve\\(\\s*['"\`](${cls})\\.(${prop})['"\`]\\s*,\\s*(['"\`])(${val})\\3\\s*\\)`);
}

// The authoritative "what does the checked-out source say right now" read —
// local disk, not GitHub, not the runtime cache — used to confirm whether a
// healed locator has actually landed in the current Page Object source.
function getCurrentLocatorFromSource(pageObject, propertyName) {
  try {
    const content = fs.readFileSync(path.join(PAGES_DIR, `${pageObject}.js`), 'utf-8');
    const match = content.match(buildResolveCallRegex({ pageObject, propertyName }));
    return match ? match[4] : null;
  } catch {
    return null;
  }
}

// Scans every Page Object file to find which class/property currently
// defaults to a given selector string — works for any broken locator whose
// old value still string-matches a hardcoded default.
function findOwnerBySelectorValue(oldSelector) {
  const files = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(PAGES_DIR, file), 'utf-8');
    const match = content.match(buildResolveCallRegex({ value: oldSelector }));
    if (match) return { file, className: match[1], propertyName: match[2] };
  }
  return null;
}

module.exports = {
  buildResolveCallRegex, getCurrentLocatorFromSource, findOwnerBySelectorValue, PAGES_DIR,
};
