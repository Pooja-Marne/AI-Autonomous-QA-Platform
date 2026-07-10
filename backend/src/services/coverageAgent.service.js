const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../config/database');
const config = require('../config/config');
const { fetchTestableSprintIssues, fetchIssueDetails } = require('./jira.service');
const { findRelatedCodeChanges } = require('./codeChangeAnalysis.service');
const { scanForCoverage } = require('./testCoverageScanner.service');
const { analyzeCoverageWithAI } = require('./aiCoverageAgent.service');

const COVERAGE_LABELS = {
  fully_covered: '✅ Fully Covered',
  partially_covered: '⚠ Partially Covered',
  no_automation: '❌ No Automation Found',
};

// Platform values must match real Playwright suites in playwrightRunner.service.js
// (SUITE_PATTERNS) — the automation repo is UI-only, so there is no real
// "api"/"ui" tagged suite; anything other than a full/complete run maps to
// the regression suite.
const SUITE_PRIORITY = ['Complete Regression', 'Regression', 'Module Regression', 'API Regression', 'UI Regression', 'Smoke'];
const SUITE_TO_PLATFORM_VALUE = {
  'Complete Regression': 'full_regression',
  'Regression': 'regression',
  'Module Regression': 'regression',
  'API Regression': 'regression',
  'UI Regression': 'regression',
  'Smoke': 'smoke',
};

function pickPlatformSuite(recommendedSuites = []) {
  for (const suite of SUITE_PRIORITY) {
    if (recommendedSuites.includes(suite)) return SUITE_TO_PLATFORM_VALUE[suite];
  }
  return 'full_regression';
}

let jobStatus = { running: false, total: 0, completed: 0, currentKey: null, startedAt: null, finishedAt: null, error: null };

function getStatus() {
  return jobStatus;
}

// Step 2-8 for a single Jira issue, persisted to coverage_analyses.
async function analyzeIssue(jiraKey) {
  const issue = await fetchIssueDetails(jiraKey);
  if (!issue) throw new Error(`Jira issue ${jiraKey} not found or unreachable`);

  const [codeChanges, scan] = await Promise.all([
    findRelatedCodeChanges(jiraKey),
    Promise.resolve().then(() => scanForCoverage({
      jiraKey,
      summary: issue.summary,
      description: issue.description,
      changedModules: [],
      changedUiPages: [],
    })),
  ]);

  // Re-scan now that we know the real changed modules/UI pages from Step 3
  const finalScan = scanForCoverage({
    jiraKey,
    summary: issue.summary,
    description: issue.description,
    changedModules: codeChanges.modules,
    changedUiPages: codeChanges.uiPages,
  });

  const ai = await analyzeCoverageWithAI({ issue, codeChanges, scan: finalScan });

  const id = uuidv4();
  const report = {
    id,
    jiraId: issue.key,
    jiraType: issue.type,
    summary: issue.summary,
    description: issue.description,
    acceptanceCriteria: issue.acceptanceCriteria,
    labels: issue.labels,
    components: issue.components,
    linkedIssues: issue.linkedIssues,
    sprint: issue.sprint,
    fixVersion: issue.fixVersions,
    status: issue.status,
    changedModules: codeChanges.modules,
    changedApis: codeChanges.apis,
    changedUiPages: codeChanges.uiPages,
    changedDbObjects: codeChanges.dbObjects,
    commits: codeChanges.commits,
    prs: codeChanges.prs,
    authors: codeChanges.authors,
    coverageStatus: COVERAGE_LABELS[ai.coverageStatus] || ai.coverageStatus,
    coverageStatusRaw: ai.coverageStatus,
    coverageReasoning: ai.coverageReasoning,
    existingTestCases: finalScan.candidates,
    missingTestCases: ai.missingTestCases,
    suggestedNewTestCases: ai.suggestedTestCases,
    automationEffort: ai.automationEffort,
    automationPriority: ai.automationPriority,
    automationRisk: ai.automationRisk,
    recommendedRegressionSuites: ai.recommendedRegressionSuites,
    recommendedSuite: pickPlatformSuite(ai.recommendedRegressionSuites),
    regressionReason: ai.regressionReason,
    releaseRisk: ai.releaseRisk,
    defectRisk: ai.defectRisk,
    changeImpact: ai.changeImpact,
    confidenceScore: ai.confidenceScore,
    automationCoveragePct: ai.automationCoveragePct,
    riskLevel: ai.releaseRisk,
    aiRecommendation: (ai.recommendations || []).join(' | '),
    recommendations: ai.recommendations,
    overallReadiness: ai.overallReadiness,
    aiGenerated: !!ai.aiGenerated,
    analyzedAt: new Date().toISOString(),
  };

  persistAnalysis(report);
  return report;
}

function persistAnalysis(report) {
  const db = getDatabase();
  const existing = db.prepare('SELECT id FROM coverage_analyses WHERE jira_key = ?').get(report.jiraId);
  const id = existing ? existing.id : report.id;

  const params = [
    report.jiraType, report.summary, report.description, report.acceptanceCriteria,
    JSON.stringify(report.labels || []), JSON.stringify(report.components || []), JSON.stringify(report.linkedIssues || []),
    report.sprint, JSON.stringify(report.fixVersion || []), report.status,
    JSON.stringify(report.changedModules || []), JSON.stringify(report.changedApis || []),
    JSON.stringify(report.changedUiPages || []), JSON.stringify(report.changedDbObjects || []),
    JSON.stringify(report.commits || []), JSON.stringify(report.prs || []), JSON.stringify(report.authors || []),
    report.coverageStatusRaw, JSON.stringify(report.existingTestCases || []), JSON.stringify(report.missingTestCases || []),
    JSON.stringify(report.suggestedNewTestCases || {}), report.automationEffort, report.automationPriority, report.automationRisk,
    JSON.stringify(report.recommendedRegressionSuites || []), report.regressionReason,
    report.releaseRisk, report.defectRisk, report.changeImpact, report.confidenceScore, report.automationCoveragePct,
    JSON.stringify(report.recommendations || []), report.overallReadiness, report.aiGenerated ? 1 : 0,
  ].map((v) => (v === undefined ? null : v)); // node:sqlite rejects `undefined` bind values outright

  if (existing) {
    db.prepare(`
      UPDATE coverage_analyses SET
        jira_type=?, summary=?, description=?, acceptance_criteria=?, labels=?, components=?, linked_issues=?,
        sprint=?, fix_version=?, status=?, changed_modules=?, changed_apis=?, changed_ui_pages=?, changed_db_objects=?,
        commits=?, prs=?, authors=?, coverage_status=?, existing_test_cases=?, missing_test_cases=?, suggested_test_cases=?,
        automation_effort=?, automation_priority=?, automation_risk=?, recommended_regression_suites=?, regression_reason=?,
        release_risk=?, defect_risk=?, change_impact=?, confidence_score=?, automation_coverage_pct=?,
        ai_recommendations=?, overall_readiness=?, ai_generated=?, analyzed_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(...params, id);
  } else {
    db.prepare(`
      INSERT INTO coverage_analyses (
        id, jira_key, jira_type, summary, description, acceptance_criteria, labels, components, linked_issues,
        sprint, fix_version, status, changed_modules, changed_apis, changed_ui_pages, changed_db_objects,
        commits, prs, authors, coverage_status, existing_test_cases, missing_test_cases, suggested_test_cases,
        automation_effort, automation_priority, automation_risk, recommended_regression_suites, regression_reason,
        release_risk, defect_risk, change_impact, confidence_score, automation_coverage_pct,
        ai_recommendations, overall_readiness, ai_generated
      ) VALUES (?, ?, ${params.map(() => '?').join(', ')})
    `).run(id, report.jiraId, ...params);
  }

  report.id = id;
}

function getStoredAnalyses({ sprint, status } = {}) {
  const db = getDatabase();
  let sql = 'SELECT * FROM coverage_analyses WHERE 1=1';
  const args = [];
  if (sprint) { sql += ' AND sprint = ?'; args.push(sprint); }
  if (status) { sql += ' AND coverage_status = ?'; args.push(status); }
  sql += ' ORDER BY analyzed_at DESC LIMIT 200';
  return db.prepare(sql).all(...args).map(deserializeRow);
}

function getStoredAnalysis(jiraKey) {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM coverage_analyses WHERE jira_key = ?').get(jiraKey);
  return row ? deserializeRow(row) : null;
}

function deserializeRow(row) {
  const jsonFields = [
    'labels', 'components', 'linked_issues', 'fix_version', 'changed_modules', 'changed_apis',
    'changed_ui_pages', 'changed_db_objects', 'commits', 'prs', 'authors', 'existing_test_cases',
    'missing_test_cases', 'suggested_test_cases', 'recommended_regression_suites', 'ai_recommendations',
  ];
  const out = { ...row };
  for (const f of jsonFields) {
    try { out[f] = JSON.parse(row[f] || '[]'); } catch { out[f] = row[f]; }
  }
  return out;
}

// Step 1: qualifying issues in the active sprint for the deep pipeline.
async function getQualifyingSprintIssues() {
  const { issues, sprint } = await fetchTestableSprintIssues();
  const qualifying = issues.filter((i) =>
    config.jira.analysisIssueTypes.some((t) => t.toLowerCase() === (i.type || '').toLowerCase())
  );
  return { allTestableIssues: issues, qualifyingIssues: qualifying, sprintName: sprint };
}

function riskPenalty(risk) {
  return { Low: 0, Medium: 15, High: 35, Critical: 60 }[risk] ?? 20;
}

function coveragePenalty(status) {
  return { fully_covered: 0, partially_covered: 8, no_automation: 20 }[status] ?? 15;
}

// Runs the full pipeline across every qualifying issue in the active sprint,
// then produces the Final Sprint Summary / release go-no-go verdict.
async function analyzeAndSummarizeSprint() {
  jobStatus = { running: true, total: 0, completed: 0, currentKey: null, startedAt: new Date().toISOString(), finishedAt: null, error: null };

  try {
    const { allTestableIssues, qualifyingIssues, sprintName } = await getQualifyingSprintIssues();
    jobStatus.total = qualifyingIssues.length;

    const reports = [];
    for (const issue of qualifyingIssues) {
      jobStatus.currentKey = issue.key;
      try {
        const report = await analyzeIssue(issue.key);
        reports.push(report);
      } catch (err) {
        console.error(`[CoverageAgent] analyzeIssue(${issue.key}) failed:`, err.message);
      }
      jobStatus.completed += 1;
    }

    const storiesClosed = allTestableIssues.filter((i) => i.type === 'Story').length;
    const bugsClosed = allTestableIssues.filter((i) => i.type === 'Bug').length;
    const storyReports = reports.filter((r) => r.jiraType === 'Story');
    const storiesWithAutomation = storyReports.filter((r) => r.coverageStatusRaw !== 'no_automation').length;
    const storiesWithoutAutomation = storyReports.length - storiesWithAutomation;

    const avgCoveragePct = reports.length
      ? Math.round(reports.reduce((sum, r) => sum + (r.automationCoveragePct || 0), 0) / reports.length)
      : 0;

    const recommendedNewTestCases = reports.flatMap((r) =>
      (r.missingTestCases || []).map((tc) => ({ jiraKey: r.jiraId, testCase: tc }))
    );

    const regressionSuitesToExecute = Array.from(new Set(reports.flatMap((r) => r.recommendedRegressionSuites || [])));

    const highRiskModules = Array.from(new Set(
      reports.filter((r) => ['High', 'Critical'].includes(r.releaseRisk)).flatMap((r) => r.changedModules || [])
    ));

    const releaseReadinessScore = reports.length
      ? Math.round(reports.reduce((sum, r) =>
          sum + Math.max(0, 100 - riskPenalty(r.releaseRisk) - coveragePenalty(r.coverageStatusRaw)), 0
        ) / reports.length)
      : 100;

    // The readiness score is an AVERAGE across items, so a single high-risk
    // item can be diluted by several low-risk ones and still clear the 70
    // threshold. The release gate must check individual items directly —
    // otherwise the top-level YES/NO can contradict a per-issue "High risk,
    // not release-ready" verdict shown right below it.
    const criticalCount = reports.filter((r) => r.releaseRisk === 'Critical').length;
    const highRiskCount = reports.filter((r) => r.releaseRisk === 'High').length;
    const noAutomationCount = reports.filter((r) => r.coverageStatusRaw === 'no_automation').length;
    const canRelease = releaseReadinessScore >= 70 && criticalCount === 0 && highRiskCount === 0 ? 'YES' : 'NO';
    const reason = canRelease === 'YES'
      ? `Release readiness score is ${releaseReadinessScore}/100 with no critical or high-risk items.`
      : `Release readiness score is ${releaseReadinessScore}/100${criticalCount ? `, ${criticalCount} item(s) at Critical release risk` : ''}${highRiskCount ? `, ${highRiskCount} item(s) at High release risk` : ''}${noAutomationCount ? `, ${noAutomationCount} item(s) with no automation` : ''}.`;

    const sprintLabel = sprintName ? `Sprint "${sprintName}"` : 'No active sprint';
    const aiRecommendation = reports.length
      ? `${sprintLabel}: ${reports.length} item(s) analyzed, ${noAutomationCount} with no automation, ${criticalCount + highRiskCount} at Critical/High release risk, ${highRiskModules.length} high-risk module(s) (${highRiskModules.join(', ') || 'none'}). ` +
        `Top recommendations: ${Array.from(new Set(reports.flatMap((r) => r.recommendations || []))).slice(0, 5).join('; ')}`
      : `${sprintLabel}: no Story/Bug items in a testable status found.`;

    const summary = {
      id: uuidv4(),
      sprintName,
      storiesClosed,
      bugsClosed,
      storiesWithAutomation,
      storiesWithoutAutomation,
      automationCoveragePct: avgCoveragePct,
      recommendedNewTestCases,
      regressionSuitesToExecute,
      highRiskModules,
      releaseReadinessScore,
      aiRecommendation,
      canRelease,
      reason,
      generatedAt: new Date().toISOString(),
      issueReports: reports,
    };

    persistSprintSummary(summary);
    jobStatus.running = false;
    jobStatus.finishedAt = new Date().toISOString();
    return summary;
  } catch (err) {
    jobStatus.running = false;
    jobStatus.finishedAt = new Date().toISOString();
    jobStatus.error = err.message;
    throw err;
  }
}

function persistSprintSummary(summary) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sprint_summaries (
      id, sprint_name, stories_closed, bugs_closed, stories_with_automation, stories_without_automation,
      automation_coverage_pct, recommended_new_test_cases, regression_suites_to_execute, high_risk_modules,
      release_readiness_score, ai_recommendation, can_release, reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    summary.id, summary.sprintName, summary.storiesClosed, summary.bugsClosed,
    summary.storiesWithAutomation, summary.storiesWithoutAutomation, summary.automationCoveragePct,
    JSON.stringify(summary.recommendedNewTestCases), JSON.stringify(summary.regressionSuitesToExecute),
    JSON.stringify(summary.highRiskModules), summary.releaseReadinessScore, summary.aiRecommendation,
    summary.canRelease, summary.reason
  );
}

function getLatestSprintSummary(sprintName) {
  const db = getDatabase();
  const row = sprintName
    ? db.prepare('SELECT * FROM sprint_summaries WHERE sprint_name = ? ORDER BY generated_at DESC LIMIT 1').get(sprintName)
    : db.prepare('SELECT * FROM sprint_summaries ORDER BY generated_at DESC LIMIT 1').get();
  if (!row) return null;
  return {
    ...row,
    recommendedNewTestCases: JSON.parse(row.recommended_new_test_cases || '[]'),
    regressionSuitesToExecute: JSON.parse(row.regression_suites_to_execute || '[]'),
    highRiskModules: JSON.parse(row.high_risk_modules || '[]'),
  };
}

module.exports = {
  analyzeIssue, analyzeAndSummarizeSprint, getStoredAnalyses, getStoredAnalysis,
  getLatestSprintSummary, getStatus, getQualifyingSprintIssues,
};
