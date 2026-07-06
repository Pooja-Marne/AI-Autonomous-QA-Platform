const { searchCommitsByJiraKey, searchPRsByJiraKey, detectImpactedModules } = require('./github.service');

const API_PATTERN = /(^|\/)(routes|controllers|api)(\/|\.)/i;
const UI_PATTERN = /frontend\/src\/(pages|components)\//i;
const DB_PATTERN = /(migrations|schema|models)\//i;
const DB_FILE_PATTERN = /database\.js$/i;

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

// Step 3: correlate a Jira issue to real code changes via GitHub search.
async function findRelatedCodeChanges(jiraKey) {
  const [commits, prs] = await Promise.all([
    searchCommitsByJiraKey(jiraKey),
    searchPRsByJiraKey(jiraKey),
  ]);

  const allFiles = Array.from(new Set(prs.flatMap((pr) => pr.files || [])));
  const { apis, uiPages, dbObjects } = classifyFiles(allFiles);
  const modules = Array.from(new Set([
    ...detectImpactedModules(allFiles),
    ...prs.flatMap((pr) => pr.impactedModules || []),
  ]));

  const authors = Array.from(new Set([
    ...commits.map((c) => c.author).filter(Boolean),
    ...prs.map((pr) => pr.author).filter(Boolean),
  ]));

  const mergeDates = prs.map((pr) => pr.mergedAt).filter(Boolean);

  return {
    jiraKey,
    commits,
    prs,
    files: allFiles,
    modules,
    apis,
    uiPages,
    dbObjects,
    authors,
    mergeDates,
    hasCodeChanges: commits.length > 0 || prs.length > 0,
  };
}

module.exports = { findRelatedCodeChanges };
