const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../config/database');
const config = require('../config/config');

async function generateReport(runId) {
  const db = getDatabase();

  const run = db.prepare('SELECT * FROM test_runs WHERE id = ?').get(runId);
  if (!run) throw new Error(`Run not found: ${runId}`);

  const testCases = db.prepare('SELECT * FROM test_cases WHERE run_id = ?').all(runId);
  const healingActions = db.prepare('SELECT * FROM healing_actions WHERE run_id = ?').all(runId);

  const failed = testCases.filter((tc) => tc.status === 'failed');
  const healed = testCases.filter((tc) => tc.status === 'healed');
  const notFixable = testCases.filter((tc) => tc.healing_status === 'not_fixable');
  const passed = testCases.filter((tc) => tc.status === 'passed');

  const failuresByType = {};
  testCases.filter((tc) => tc.failure_type).forEach((tc) => {
    failuresByType[tc.failure_type] = (failuresByType[tc.failure_type] || 0) + 1;
  });

  const failuresByModule = {};
  testCases.filter((tc) => tc.status !== 'passed' && tc.status !== 'skipped').forEach((tc) => {
    if (tc.module) failuresByModule[tc.module] = (failuresByModule[tc.module] || 0) + 1;
  });

  const jiraLinks = [...new Set(testCases.filter((tc) => tc.jira_issue_key).map((tc) => ({
    key: tc.jira_issue_key,
    url: `${config.jira.baseUrl}/browse/${tc.jira_issue_key}`,
    testCase: tc.name,
  })))];

  const healingSuccessRate = healingActions.length
    ? ((healingActions.filter((h) => h.success).length / healingActions.length) * 100).toFixed(1)
    : 0;

  const summary = buildSummaryText(run, passed, failed, healed, notFixable, healingSuccessRate);
  const healingSummary = buildHealingSummary(healed, notFixable, healingActions, failuresByType);

  const rootCauseAnalysis = buildRootCauseAnalysis(failed, healed, failuresByType, failuresByModule);

  const report = {
    id: uuidv4(),
    runId,
    title: `QA Report: ${run.name}`,
    summary,
    healingSummary,
    rootCauseAnalysis,
    jiraLinks: JSON.stringify(jiraLinks),
    metrics: {
      totalTests: run.total_tests,
      passed: passed.length,
      failed: failed.length,
      healed: healed.length,
      notFixable: notFixable.length,
      skipped: run.skipped,
      passRate: run.total_tests ? ((passed.length / run.total_tests) * 100).toFixed(1) : 0,
      healingRate: healingSuccessRate,
      duration: run.duration_ms,
    },
    failuresByType,
    failuresByModule,
    testCases: {
      passed: passed.map(mapTestCaseForReport),
      failed: failed.map(mapTestCaseForReport),
      healed: healed.map(mapTestCaseForReport),
      notFixable: notFixable.map(mapTestCaseForReport),
    },
    healingActions: healingActions.map(mapHealingActionForReport),
    jiraData: jiraLinks,
  };

  db.prepare(`
    INSERT OR REPLACE INTO reports (id, run_id, title, summary, healing_summary, jira_links)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(report.id, runId, report.title, summary, healingSummary, report.jiraLinks);

  return report;
}

function buildSummaryText(run, passed, failed, healed, notFixable, healingRate) {
  const total = run.total_tests;
  const passRate = total ? ((passed.length / total) * 100).toFixed(1) : 0;
  const statusEmoji = failed.length === 0 ? '✅' : healed.length > 0 ? '⚡' : '❌';
  return `${statusEmoji} Run: ${run.name} | Total: ${total} | ✅ Passed: ${passed.length} (${passRate}%) | ❌ Failed: ${failed.length} | 🔧 Healed: ${healed.length} | 🚫 Not Fixable: ${notFixable.length} | AI Healing Rate: ${healingRate}%`;
}

function buildHealingSummary(healed, notFixable, healingActions, failuresByType) {
  const healedList = healed.map((tc) => `• [HEALED] ${tc.name}: ${tc.healing_action || 'Auto-fixed by AI'}`).join('\n');
  const nfList = notFixable.map((tc) => `• [NOT FIXABLE] ${tc.name}: ${tc.error_message?.substring(0, 100) || 'Unknown error'}`).join('\n');

  const topFailureType = Object.entries(failuresByType).sort((a, b) => b[1] - a[1])[0];
  const avgConfidence = healingActions.length
    ? (healingActions.reduce((sum, h) => sum + (h.confidence_score || 0), 0) / healingActions.length).toFixed(2)
    : 0;

  return `AI Healing Summary:
Healed: ${healed.length} test cases
Not Fixable: ${notFixable.length} test cases
Top Failure Type: ${topFailureType ? `${topFailureType[0]} (${topFailureType[1]} cases)` : 'None'}
Average AI Confidence: ${avgConfidence}

${healedList ? 'Healed Cases:\n' + healedList : ''}
${nfList ? '\nNot Fixable Cases:\n' + nfList : ''}`;
}

function buildRootCauseAnalysis(failed, healed, failuresByType, failuresByModule) {
  const allFailed = [...failed, ...healed];
  if (!allFailed.length) return 'No failures detected in this run.';

  const typeAnalysis = Object.entries(failuresByType)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => `  • ${formatFailureType(type)}: ${count} cases`)
    .join('\n');

  const moduleAnalysis = Object.entries(failuresByModule)
    .sort((a, b) => b[1] - a[1])
    .map(([mod, count]) => `  • ${mod}: ${count} failures`)
    .join('\n');

  return `Root Cause Analysis:

Failure Distribution by Type:
${typeAnalysis || '  No typed failures'}

Most Unstable Modules:
${moduleAnalysis || '  No module failures'}

Recommendations:
${generateRecommendations(failuresByType, failuresByModule)}`;
}

function generateRecommendations(failuresByType, failuresByModule) {
  const recs = [];
  if (failuresByType.locator_issue > 0) recs.push('• Migrate to data-testid attributes for stable selectors');
  if (failuresByType.api_mismatch > 0) recs.push('• Review API contracts and update test assertions');
  if (failuresByType.data_issue > 0) recs.push('• Implement proper test data seeding and cleanup');
  if (failuresByType.environment_issue > 0) recs.push('• Check environment configuration and service health');
  if (failuresByType.timeout > 0) recs.push('• Increase wait timeouts and add retry mechanisms');

  const topModule = Object.entries(failuresByModule).sort((a, b) => b[1] - a[1])[0];
  if (topModule) recs.push(`• Focus stabilization efforts on "${topModule[0]}" module`);

  return recs.length ? recs.join('\n') : '• No specific recommendations';
}

function formatFailureType(type) {
  return type.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function mapTestCaseForReport(tc) {
  return {
    id: tc.id,
    name: tc.name,
    module: tc.module,
    status: tc.status,
    failureType: tc.failure_type,
    errorMessage: tc.error_message,
    healingStatus: tc.healing_status,
    healingAction: tc.healing_action,
    jiraLink: tc.jira_issue_key ? `${config.jira.baseUrl}/browse/${tc.jira_issue_key}` : null,
    duration: tc.duration_ms,
  };
}

function mapHealingActionForReport(action) {
  return {
    id: action.id,
    failureType: action.failure_type,
    success: Boolean(action.success),
    confidence: action.confidence_score,
    aiAnalysis: action.ai_analysis ? JSON.parse(action.ai_analysis) : null,
    suggestedFix: action.suggested_fix,
    fixApplied: action.fix_applied,
    modelUsed: action.model_used,
    tokensUsed: action.tokens_used,
  };
}

async function getReportByRunId(runId) {
  const db = getDatabase();
  const report = db.prepare('SELECT * FROM reports WHERE run_id = ? ORDER BY generated_at DESC LIMIT 1').get(runId);
  if (!report) return generateReport(runId);
  return {
    ...report,
    jiraLinks: JSON.parse(report.jira_links || '[]'),
  };
}

module.exports = { generateReport, getReportByRunId };
