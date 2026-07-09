const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { getDatabase } = require('../config/database');

// Fetch Jira issue details from local DB for healing context
function getJiraContext(jiraIssueKey) {
  if (!jiraIssueKey) return null;
  try {
    const db = getDatabase();
    const issue = db.prepare('SELECT * FROM jira_issues WHERE key = ?').get(jiraIssueKey);
    if (!issue) return null;
    return {
      key: issue.key,
      summary: issue.summary,
      description: issue.description || '',
      type: issue.type || 'Story',
      status: issue.status,
      priority: issue.priority,
      assignee: issue.assignee,
      // url is not stored in DB — construct from config
      url: `${config.jira.baseUrl}/browse/${issue.key}`,
    };
  } catch {
    return null;
  }
}

function buildJiraContextBlock(jiraCtx) {
  if (!jiraCtx) return '';
  return `
Jira Story Context:
  Key: ${jiraCtx.key}
  Summary: ${jiraCtx.summary}
  Type: ${jiraCtx.type} | Priority: ${jiraCtx.priority} | Status: ${jiraCtx.status}
  Description / Acceptance Criteria: ${jiraCtx.description || 'N/A'}
  Assigned To: ${jiraCtx.assignee || 'Unassigned'}
  URL: ${jiraCtx.url || 'N/A'}
`;
}

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseURL,
});

const FAILURE_TYPES = {
  LOCATOR_ISSUE: 'locator_issue',
  API_MISMATCH: 'api_mismatch',
  DATA_ISSUE: 'data_issue',
  ENVIRONMENT_ISSUE: 'environment_issue',
  ASSERTION_FAILURE: 'assertion_failure',
  TIMEOUT: 'timeout',
  UNKNOWN: 'unknown',
};

async function classifyFailure(testCase) {
  const { name, errorMessage, stackTrace, filePathTest, jiraIssueKey } = testCase;

  // Enrich with Jira story context when available
  const jiraCtx = getJiraContext(jiraIssueKey);
  const jiraBlock = buildJiraContextBlock(jiraCtx);

  const prompt = `You are an expert QA engineer analyzing test failures.

Analyze this test failure and classify it:

Test Name: ${name}
Error Message: ${errorMessage || 'N/A'}
Stack Trace: ${stackTrace ? stackTrace.substring(0, 1000) : 'N/A'}
File: ${filePathTest || 'N/A'}
${jiraBlock}
Classify the failure into ONE of these categories:
- locator_issue: Element not found, stale element, selector broken
- api_mismatch: API response changed, wrong status code, schema mismatch
- data_issue: Test data missing/wrong, database state issue
- environment_issue: Network error, service unavailable, config problem
- assertion_failure: Logic changed but test not updated
- timeout: Operation took too long
- unknown: Cannot determine

Use the Jira story context (acceptance criteria, description) to better understand what the test is verifying and why it might be failing.

Respond in JSON format:
{
  "failureType": "<type>",
  "confidence": <0.0-1.0>,
  "reasoning": "<brief explanation referencing the Jira story if relevant>",
  "canAutoHeal": <true/false>,
  "suggestedFix": "<specific fix suggestion aligned with the Jira acceptance criteria>"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: 'You are an expert automated QA engineer specializing in test failure analysis and self-healing systems.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content);
    return {
      failureType: result.failureType || FAILURE_TYPES.UNKNOWN,
      confidence: result.confidence || 0.5,
      reasoning: result.reasoning || '',
      canAutoHeal: result.canAutoHeal || false,
      suggestedFix: result.suggestedFix || '',
      tokensUsed: response.usage?.total_tokens || 0,
    };
  } catch (err) {
    console.error('[AI Healing] classifyFailure error:', err.message);
    return ruleBasedClassification(testCase);
  }
}

async function generateHealingSuggestion(testCase, failureAnalysis) {
  // Enrich with Jira story context when available
  const jiraCtx = getJiraContext(testCase.jiraIssueKey);
  const jiraBlock = buildJiraContextBlock(jiraCtx);

  const prompt = `You are an AI self-healing test agent. Generate a specific healing action.

Test Case: ${testCase.name}
Failure Type: ${failureAnalysis.failureType}
Error: ${testCase.errorMessage || 'N/A'}
Current Selector/Config: ${testCase.originalSelector || 'N/A'}
Stack Trace: ${testCase.stackTrace ? testCase.stackTrace.substring(0, 800) : 'N/A'}
AI Analysis: ${failureAnalysis.reasoning}
${jiraBlock}
The healing plan MUST be aligned with what the Jira story requires. If the story has acceptance criteria, ensure the healed test still validates those criteria correctly.

Generate a detailed healing plan in JSON:
{
  "healingAction": "<description of what to fix, referencing Jira story if relevant>",
  "fixType": "<selector_update|data_refresh|retry|config_change|assertion_update>",
  "newSelector": "<new CSS/XPath selector if applicable>",
  "codeChange": "<specific code change needed>",
  "retryStrategy": "<immediate|delayed|skip>",
  "confidence": <0.0-1.0>,
  "estimatedSuccess": <true/false>,
  "jiraAlignment": "<how this fix aligns with the Jira story acceptance criteria>",
  "steps": ["<step1>", "<step2>", "<step3>"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: config.openai.model,
      messages: [
        { role: 'system', content: 'You are an expert self-healing test automation engineer.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content);
    return {
      ...result,
      tokensUsed: response.usage?.total_tokens || 0,
    };
  } catch (err) {
    console.error('[AI Healing] generateHealingSuggestion error:', err.message);
    return generateRuleBasedFix(testCase, failureAnalysis);
  }
}

// This path only ever runs for failures with NO extractable locator
// (assertion mismatches, timeouts, network/API errors) — anything
// DOM-addressable is routed to the real healing pipeline in
// demoHealingAgent.service.js before it ever reaches here. There is no
// generalized, verifiable auto-fix for "the assertion changed" or "the
// request timed out" without a real code change, so this never marks a
// test "healed" — it produces a real OpenAI diagnosis (reasoning + a
// suggested fix a human can apply) and always leaves the test as
// not_fixable. Previously this used to fake a "healed" outcome via
// Math.random() — that was misleading and has been removed.
async function healTestCase(testCase) {
  console.log(`[AI Healing] Diagnosing (no auto-fix possible): ${testCase.name}`);
  const db = getDatabase();

  try {
    const failureAnalysis = await classifyFailure(testCase);
    const healingPlan = await generateHealingSuggestion(testCase, failureAnalysis);

    const healingId = uuidv4();
    const healingStatus = 'not_fixable';
    const appliedFix = null;

    // Merge jiraAlignment into the healing plan for storage
    const enrichedPlan = {
      ...healingPlan,
      jiraIssueKey: testCase.jiraIssueKey || null,
      jiraAlignment: healingPlan.jiraAlignment || null,
    };

    db.prepare(`
      INSERT INTO healing_actions (id, test_case_id, run_id, failure_type, original_error, ai_analysis, suggested_fix, fix_applied, success, confidence_score, model_used, tokens_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      healingId,
      testCase.id,
      testCase.runId,
      failureAnalysis.failureType,
      testCase.errorMessage || '',
      JSON.stringify({ ...failureAnalysis, jiraIssueKey: testCase.jiraIssueKey }),
      healingPlan.healingAction || '',
      appliedFix || '',
      healingStatus === 'healed' ? 1 : 0,
      failureAnalysis.confidence,
      config.openai.model,
      (failureAnalysis.tokensUsed || 0) + (healingPlan.tokensUsed || 0)
    );

    db.prepare(`
      UPDATE test_cases SET
        failure_type = ?,
        healing_status = ?,
        healing_action = ?,
        healing_suggestion = ?,
        healed_selector = ?,
        status = ?
      WHERE id = ?
    `).run(
      failureAnalysis.failureType,
      healingStatus,
      healingPlan.healingAction || '',
      JSON.stringify(enrichedPlan),
      healingPlan.newSelector || testCase.originalSelector || '',
      healingStatus === 'healed' ? 'healed' : 'failed',
      testCase.id
    );

    return {
      id: healingId,
      testCaseId: testCase.id,
      failureType: failureAnalysis.failureType,
      healingStatus,
      healingAction: healingPlan.healingAction,
      confidence: failureAnalysis.confidence,
      suggestedFix: failureAnalysis.suggestedFix,
      steps: healingPlan.steps || [],
    };
  } catch (err) {
    console.error('[AI Healing] healTestCase error:', err.message);
    db.prepare(`UPDATE test_cases SET healing_status = 'not_fixable', failure_type = 'unknown' WHERE id = ?`).run(testCase.id);
    return { testCaseId: testCase.id, healingStatus: 'not_fixable', error: err.message };
  }
}

async function healMultipleTestCases(failedTestCases) {
  console.log(`[AI Healing] Healing ${failedTestCases.length} failed test cases...`);
  const results = [];
  for (const tc of failedTestCases) {
    const result = await healTestCase(tc);
    results.push(result);
    await new Promise((r) => setTimeout(r, 500));
  }
  return results;
}

function ruleBasedClassification(testCase) {
  const error = (testCase.errorMessage || '').toLowerCase();
  const stack = (testCase.stackTrace || '').toLowerCase();

  if (error.includes('no such element') || error.includes('element not found') || error.includes('selector')) {
    return { failureType: FAILURE_TYPES.LOCATOR_ISSUE, confidence: 0.8, canAutoHeal: true, suggestedFix: 'Update element selector', reasoning: 'Element selector appears broken', tokensUsed: 0 };
  }
  if (error.includes('404') || error.includes('500') || error.includes('api') || error.includes('network')) {
    return { failureType: FAILURE_TYPES.API_MISMATCH, confidence: 0.75, canAutoHeal: false, suggestedFix: 'Check API endpoint and response schema', reasoning: 'API issue detected', tokensUsed: 0 };
  }
  if (error.includes('timeout') || error.includes('timed out')) {
    return { failureType: FAILURE_TYPES.TIMEOUT, confidence: 0.9, canAutoHeal: true, suggestedFix: 'Increase timeout and add retry logic', reasoning: 'Operation timeout', tokensUsed: 0 };
  }
  if (error.includes('assertion') || error.includes('expected') || error.includes('actual')) {
    return { failureType: FAILURE_TYPES.ASSERTION_FAILURE, confidence: 0.7, canAutoHeal: false, suggestedFix: 'Review assertion values', reasoning: 'Assertion mismatch', tokensUsed: 0 };
  }
  return { failureType: FAILURE_TYPES.UNKNOWN, confidence: 0.3, canAutoHeal: false, suggestedFix: 'Manual investigation required', reasoning: 'Unclassified failure', tokensUsed: 0 };
}

function generateRuleBasedFix(testCase, analysis) {
  const fixes = {
    [FAILURE_TYPES.LOCATOR_ISSUE]: { healingAction: 'Update CSS selector to use data-testid or more stable attribute', fixType: 'selector_update', newSelector: `[data-testid="${testCase.name.toLowerCase().replace(/\s+/g, '-')}"]`, retryStrategy: 'immediate', confidence: 0.6, estimatedSuccess: true, steps: ['Identify stable attribute', 'Update selector', 'Verify element exists', 'Re-run test'] },
    [FAILURE_TYPES.TIMEOUT]: { healingAction: 'Increase wait timeout and implement smart wait strategy', fixType: 'retry', retryStrategy: 'delayed', confidence: 0.7, estimatedSuccess: true, steps: ['Increase timeout to 30s', 'Add explicit wait for element visibility', 'Add retry logic'] },
    [FAILURE_TYPES.API_MISMATCH]: { healingAction: 'Review API contract and update request/response mappings', fixType: 'assertion_update', retryStrategy: 'skip', confidence: 0.4, estimatedSuccess: false, steps: ['Check API documentation', 'Compare response schema', 'Update test assertions'] },
    [FAILURE_TYPES.DATA_ISSUE]: { healingAction: 'Refresh test data and reset database state', fixType: 'data_refresh', retryStrategy: 'immediate', confidence: 0.65, estimatedSuccess: true, steps: ['Reset test database', 'Seed fresh data', 'Re-run test'] },
  };
  return fixes[analysis.failureType] || { healingAction: 'Manual investigation required', fixType: 'manual', retryStrategy: 'skip', confidence: 0.2, estimatedSuccess: false, steps: ['Review failure details', 'Manual fix required'], tokensUsed: 0 };
}

async function getHealingStats(runId) {
  const db = getDatabase();
  const query = runId
    ? db.prepare('SELECT * FROM healing_actions WHERE run_id = ? ORDER BY created_at DESC').all(runId)
    : db.prepare('SELECT * FROM healing_actions ORDER BY created_at DESC LIMIT 100').all();
  return query;
}

module.exports = { healTestCase, healMultipleTestCases, classifyFailure, generateHealingSuggestion, getHealingStats, FAILURE_TYPES };
