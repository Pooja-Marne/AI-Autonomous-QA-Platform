const API_PATTERN = /(^|\/)(routes|controllers|api)(\/|\.)/i;
const UI_PATTERN = /frontend\/src\/(pages|components)\//i;
const DB_PATTERN = /(migrations|schema|models)\//i;
const DB_FILE_PATTERN = /database\.js$/i;

const MODULE_KEYWORDS = {
  auth: ['auth', 'login', 'register', 'oauth', 'token'],
  api: ['api', 'routes', 'endpoints', 'controllers'],
  database: ['db', 'database', 'models', 'migrations', 'schema'],
  ui: ['components', 'pages', 'views', 'frontend', 'src'],
  tests: ['test', 'spec', 'e2e', '__tests__'],
  config: ['config', 'env', 'settings'],
  services: ['services', 'utils', 'helpers', 'lib'],
};

function detectImpactedModules(files) {
  const impacted = new Set();
  for (const file of files) {
    const lower = file.toLowerCase();
    for (const [module, keywords] of Object.entries(MODULE_KEYWORDS)) {
      if (keywords.some((kw) => lower.includes(kw))) impacted.add(module);
    }
  }
  return Array.from(impacted);
}

function classifyFiles(files) {
  const apis = new Set();
  const uiPages = new Set();
  const dbObjects = new Set();

  for (const file of files) {
    if (API_PATTERN.test(file)) apis.add(file);
    if (UI_PATTERN.test(file)) uiPages.add(file);
    if (DB_PATTERN.test(file) || DB_FILE_PATTERN.test(file)) dbObjects.add(file);
  }

  return {
    apis: Array.from(apis),
    uiPages: Array.from(uiPages),
    dbObjects: Array.from(dbObjects),
  };
}

// Step 3 of the Coverage Intelligence Agent: correlate a Jira issue to real
// code changes. There is no source-control integration wired up — this
// always returns an empty (but correctly-shaped) result so the rest of the
// pipeline degrades gracefully ("no code changes found") instead of failing.
async function findRelatedCodeChanges(jiraKey) {
  const commits = [];
  const prs = [];
  const allFiles = [];
  const { apis, uiPages, dbObjects } = classifyFiles(allFiles);

  return {
    jiraKey,
    commits,
    prs,
    files: allFiles,
    modules: detectImpactedModules(allFiles),
    apis,
    uiPages,
    dbObjects,
    authors: [],
    mergeDates: [],
    hasCodeChanges: false,
  };
}

module.exports = { findRelatedCodeChanges, detectImpactedModules };
