const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config/config');

const anthropic = config.anthropic.apiKey ? new Anthropic({ apiKey: config.anthropic.apiKey }) : null;

const TEST_CASE_LIST_SCHEMA = { type: 'array', items: { type: 'string' } };

const COVERAGE_SCHEMA = {
  type: 'object',
  properties: {
    coverageStatus: { type: 'string', enum: ['fully_covered', 'partially_covered', 'no_automation'] },
    coverageReasoning: { type: 'string' },
    missingTestCases: TEST_CASE_LIST_SCHEMA,
    suggestedTestCases: {
      type: 'object',
      properties: {
        ui: TEST_CASE_LIST_SCHEMA,
        api: TEST_CASE_LIST_SCHEMA,
        positive: TEST_CASE_LIST_SCHEMA,
        negative: TEST_CASE_LIST_SCHEMA,
        boundary: TEST_CASE_LIST_SCHEMA,
        validation: TEST_CASE_LIST_SCHEMA,
        regression: TEST_CASE_LIST_SCHEMA,
        edge: TEST_CASE_LIST_SCHEMA,
      },
      required: ['ui', 'api', 'positive', 'negative', 'boundary', 'validation', 'regression', 'edge'],
    },
    automationEffort: { type: 'string', description: 'e.g. "Low (2-4 hrs)", "Medium (1-2 days)", "High (3+ days)"' },
    automationPriority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
    automationRisk: { type: 'string', enum: ['Low', 'Medium', 'High'] },
    recommendedRegressionSuites: {
      type: 'array',
      items: { type: 'string', enum: ['Smoke', 'Regression', 'API Regression', 'UI Regression', 'Module Regression', 'Complete Regression'] },
    },
    regressionReason: { type: 'string' },
    releaseRisk: { type: 'string', enum: ['Low', 'Medium', 'High', 'Critical'] },
    defectRisk: { type: 'string', enum: ['Low', 'Medium', 'High'] },
    changeImpact: { type: 'string', enum: ['Low', 'Medium', 'High'] },
    confidenceScore: { type: 'number', description: '0-100' },
    automationCoveragePct: { type: 'number', description: '0-100' },
    recommendations: TEST_CASE_LIST_SCHEMA,
    overallReadiness: { type: 'string' },
  },
  required: [
    'coverageStatus', 'coverageReasoning', 'missingTestCases', 'suggestedTestCases',
    'automationEffort', 'automationPriority', 'automationRisk',
    'recommendedRegressionSuites', 'regressionReason',
    'releaseRisk', 'defectRisk', 'changeImpact', 'confidenceScore', 'automationCoveragePct',
    'recommendations', 'overallReadiness',
  ],
};

function buildPrompt({ issue, codeChanges, scan }) {
  const existingTestsBlock = scan.candidates.slice(0, 15).map((c) =>
    `- [${c.file}] "${c.title}" tags=${JSON.stringify(c.tags)} score=${c.score} executed=${c.executed} passing=${c.passing} flaky=${c.flaky} recentlyExecuted=${c.recentlyExecuted}`
  ).join('\n') || '(no matching automated tests found)';

  return `You are an expert QA Automation Lead performing a release-readiness review for a Jira item that just closed.

Jira Issue:
  Key: ${issue.key}
  Type: ${issue.type}
  Summary: ${issue.summary}
  Description: ${issue.description || 'N/A'}
  Acceptance Criteria: ${issue.acceptanceCriteria || '(not explicitly labeled — infer from description)'}
  Labels: ${JSON.stringify(issue.labels || [])}
  Components: ${JSON.stringify(issue.components || [])}
  Linked Issues: ${JSON.stringify(issue.linkedIssues || [])}
  Sprint: ${issue.sprint || 'N/A'}
  Fix Version: ${JSON.stringify(issue.fixVersions || [])}
  Priority: ${issue.priority}

Related Code Changes (from GitHub):
  Commits: ${codeChanges.commits.length}
  Pull Requests: ${codeChanges.prs.length}
  Changed Modules: ${JSON.stringify(codeChanges.modules)}
  Changed APIs: ${JSON.stringify(codeChanges.apis)}
  Changed UI Pages: ${JSON.stringify(codeChanges.uiPages)}
  Changed DB Objects: ${JSON.stringify(codeChanges.dbObjects)}
  Authors: ${JSON.stringify(codeChanges.authors)}
  ${codeChanges.hasCodeChanges ? '' : '(No commits/PRs in this repo reference this Jira key directly — base your analysis on the issue description and any changed modules provided.)'}

Existing Automated Tests Found in the Automation Repository (matched by Jira key / keyword / module / page object):
${existingTestsBlock}

Using all of the above, produce a full coverage-intelligence report via the emit_coverage_report tool. Rules:
- coverageStatus = "fully_covered" only if there are existing, passing, recently-executed tests that clearly cover the acceptance criteria. "partially_covered" if some relevant tests exist but gaps remain (missing negative/edge cases, failing/flaky tests, or stale runs). "no_automation" if nothing relevant was found.
- missingTestCases should be empty only when coverageStatus is fully_covered.
- suggestedTestCases must be populated (even for partially/fully covered items, suggest what would close remaining gaps) with concrete, specific test case titles — not generic placeholders.
- recommendedRegressionSuites should reflect the actual blast radius (e.g. a pure UI change doesn't need "API Regression").
- Be concise but specific in reasoning fields.`;
}

function fallbackReport({ scan, codeChanges }) {
  const hasTests = scan.hasAnyMatch;
  const allPassing = hasTests && scan.candidates.every((c) => c.passing !== false);
  const anyFlaky = scan.candidates.some((c) => c.flaky);
  const anyStale = hasTests && scan.candidates.every((c) => c.recentlyExecuted === false);

  let coverageStatus = 'no_automation';
  if (hasTests) coverageStatus = allPassing && !anyFlaky && !anyStale ? 'fully_covered' : 'partially_covered';

  const coveragePct = hasTests ? Math.min(100, scan.candidates.length * 20) : 0;
  const changeSize = codeChanges.files.length;
  const risk = changeSize > 10 ? 'High' : changeSize > 3 ? 'Medium' : 'Low';

  return {
    coverageStatus,
    coverageReasoning: hasTests
      ? `Rule-based fallback: found ${scan.candidates.length} related test(s); passing=${allPassing}, flaky=${anyFlaky}, stale=${anyStale}.`
      : 'Rule-based fallback: no automated tests matched this issue by Jira key, keyword, module, or page object.',
    missingTestCases: hasTests ? ['Negative scenarios', 'Boundary/edge cases'] : ['Full UI/API coverage for this feature'],
    suggestedTestCases: {
      ui: ['Verify primary UI flow for this change'],
      api: ['Verify API contract for this change'],
      positive: ['Happy-path scenario succeeds with valid data'],
      negative: ['Invalid input is rejected with a clear error'],
      boundary: ['Min/max/edge-length input values are handled correctly'],
      validation: ['Required field validation is enforced'],
      regression: ['Existing related flows still pass after this change'],
      edge: ['Concurrent/rare-state scenario is handled gracefully'],
    },
    automationEffort: 'Medium (1-2 days)',
    automationPriority: 'Medium',
    automationRisk: risk,
    recommendedRegressionSuites: hasTests ? ['Regression'] : ['Smoke', 'Regression'],
    regressionReason: 'Rule-based fallback: defaulting to a broad suite since no AI risk analysis was available.',
    releaseRisk: risk,
    defectRisk: coverageStatus === 'no_automation' ? 'High' : 'Medium',
    changeImpact: risk,
    confidenceScore: 40,
    automationCoveragePct: coveragePct,
    recommendations: hasTests
      ? ['Review flaky/stale tests before release', 'Expand coverage for negative and edge cases']
      : ['No automation found — add tests before relying on this feature in regression'],
    overallReadiness: coverageStatus === 'fully_covered' ? 'Ready' : 'Needs Review',
    aiGenerated: false,
  };
}

const VALID_COVERAGE_STATUS = ['fully_covered', 'partially_covered', 'no_automation'];
const VALID_SUITES = ['Smoke', 'Regression', 'API Regression', 'UI Regression', 'Module Regression', 'Complete Regression'];

// Occasionally a Claude tool-use response leaks raw tool-call syntax (e.g.
// `<parameter name="item">...`) into a string value, or nests an entire
// JSON array as a single string element instead of separate items. Clean
// and un-nest defensively rather than surfacing that noise to users.
function cleanText(s) {
  return String(s).replace(/<\/?parameter[^>]*>/g, '').trim();
}

function toArray(v) {
  const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
  const out = [];
  for (const item of arr) {
    const cleaned = cleanText(item);
    if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
      try {
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) { out.push(...parsed.map((x) => cleanText(x)).filter(Boolean)); continue; }
      } catch { /* not actually JSON — keep as plain text below */ }
    }
    if (cleaned) out.push(cleaned);
  }
  return out;
}

function toNum(v, fallback) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function toStr(v, fallback = '') {
  return v == null ? fallback : String(v);
}

// Anthropic's tool-use input_schema guides the model but isn't strictly
// enforced server-side, so a live response can still deviate (a string
// instead of an array, a missing field, etc). Normalize defensively before
// this ever reaches SQLite binding or array methods like .join()/.map().
function normalizeReport(raw) {
  const suggested = raw.suggestedTestCases || {};
  return {
    coverageStatus: VALID_COVERAGE_STATUS.includes(raw.coverageStatus) ? raw.coverageStatus : 'no_automation',
    coverageReasoning: toStr(raw.coverageReasoning),
    missingTestCases: toArray(raw.missingTestCases),
    suggestedTestCases: {
      ui: toArray(suggested.ui), api: toArray(suggested.api), positive: toArray(suggested.positive),
      negative: toArray(suggested.negative), boundary: toArray(suggested.boundary), validation: toArray(suggested.validation),
      regression: toArray(suggested.regression), edge: toArray(suggested.edge),
    },
    automationEffort: toStr(raw.automationEffort, 'Unknown'),
    automationPriority: toStr(raw.automationPriority, 'Medium'),
    automationRisk: toStr(raw.automationRisk, 'Medium'),
    recommendedRegressionSuites: toArray(raw.recommendedRegressionSuites).filter((s) => VALID_SUITES.includes(s)),
    regressionReason: toStr(raw.regressionReason),
    releaseRisk: toStr(raw.releaseRisk, 'Medium'),
    defectRisk: toStr(raw.defectRisk, 'Medium'),
    changeImpact: toStr(raw.changeImpact, 'Medium'),
    confidenceScore: toNum(raw.confidenceScore, 50),
    automationCoveragePct: toNum(raw.automationCoveragePct, 0),
    recommendations: toArray(raw.recommendations),
    overallReadiness: toStr(raw.overallReadiness, 'Needs Review'),
    aiGenerated: !!raw.aiGenerated,
  };
}

// Steps 5-8: coverage decision, suggested tests, regression-suite recommendation,
// and risk analysis — a single Claude call via forced tool-use for reliable
// structured output. Falls back to deterministic rules if no API key is
// configured or the call fails/truncates, so callers never need to branch on
// shape — only on the `aiGenerated` flag.
async function analyzeCoverageWithAI({ issue, codeChanges, scan }) {
  if (!anthropic) return normalizeReport(fallbackReport({ scan, codeChanges }));

  try {
    const response = await anthropic.messages.create({
      model: config.anthropic.model,
      max_tokens: 8000,
      tools: [{
        name: 'emit_coverage_report',
        description: 'Emit a structured sprint coverage intelligence report for one Jira issue.',
        input_schema: COVERAGE_SCHEMA,
      }],
      tool_choice: { type: 'tool', name: 'emit_coverage_report' },
      messages: [{ role: 'user', content: buildPrompt({ issue, codeChanges, scan }) }],
    });

    if (response.stop_reason === 'max_tokens') throw new Error('Claude response truncated at max_tokens');
    const block = response.content.find((b) => b.type === 'tool_use');
    if (!block) throw new Error('No tool_use block in Claude response');

    return normalizeReport({ ...block.input, aiGenerated: true });
  } catch (err) {
    console.error(`[AI Coverage Agent] analyzeCoverageWithAI(${issue.key}) error:`, err.message);
    return normalizeReport(fallbackReport({ scan, codeChanges }));
  }
}

module.exports = { analyzeCoverageWithAI };
