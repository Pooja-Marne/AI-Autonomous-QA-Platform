import { useCallback, useRef, useState } from 'react';
import { runsApi } from '../services/api';

const POLL_MS = 1500;

const MODULE_LABELS = { auth: 'Login', cart: 'Cart', checkout: 'Checkout', inventory: 'Inventory', e2e: 'End to End' };

const initialState = {
  phase: 'idle',
  connectSteps: [],
  suites: [],
  revealedFailures: [],
  healing: null,
  healedKeys: [],
  timelineCount: 0,
  showConfetti: false,
};

function deriveSuites(liveRun, testCases) {
  const keys = liveRun ? Object.keys(liveRun.modules || {}) : [...new Set((testCases || []).map((tc) => tc.module))];
  return keys.map((key) => {
    const casesForModule = (testCases || []).filter((tc) => tc.module === key);
    const liveMod = liveRun?.modules?.[key];
    let status = 'pending';
    if (casesForModule.length > 0) {
      status = casesForModule.some((tc) => tc.status === 'failed') ? 'failed' : 'passed';
    } else if (liveMod?.status === 'running' || liveMod?.status === 'failed') {
      status = liveMod.status === 'failed' ? 'running' : 'running'; // still executing until final counts land
    }
    const progress = status === 'pending' ? 0 : status === 'running' ? 50 : 100;
    return { key, label: MODULE_LABELS[key] || key, status, progress, logs: liveRun?.logs || [] };
  });
}

function deriveFailures(testCases) {
  return (testCases || [])
    .filter((tc) => tc.status === 'failed' || tc.healing_status === 'healed' || tc.healing_status === 'not_fixable')
    .map((tc) => ({
      key: tc.id,
      title: tc.name,
      suite: MODULE_LABELS[tc.module] || tc.module,
      reason: (tc.error_message || '').slice(0, 140) || 'Test failed',
      healable: tc.healing_status === 'healed',
    }));
}

const HEALING_STEP_LABELS = {
  starting: 'Detecting broken locator',
  reproducing: 'Reproducing failure against the live application',
  analyzing: 'Analyzing DOM and searching for a replacement locator',
  verifying: 'Validating suggested locator against the live DOM',
  retrying: 'Applying fix and re-running the test',
  done: 'Healing cycle complete',
};
const STEP_ORDER = ['starting', 'reproducing', 'analyzing', 'verifying', 'retrying', 'done'];

function deriveHealing(activeCycle, failures) {
  if (!activeCycle) return null;
  const failure = failures.find((f) => f.key === activeCycle.locatorKey) || {};
  const stepIndex = Math.max(0, STEP_ORDER.indexOf(activeCycle.step));
  return {
    key: activeCycle.locatorKey,
    title: failure.title || activeCycle.locatorKey,
    healable: true,
    stepIndex: activeCycle.step === 'done' ? STEP_ORDER.length : stepIndex,
    steps: STEP_ORDER.slice(0, -1).map((s) => HEALING_STEP_LABELS[s]),
    result: activeCycle.newLocator ? {
      reasoning: activeCycle.rootCause || '',
      oldLocator: activeCycle.oldLocator,
      newLocator: activeCycle.newLocator,
      confidenceLabel: `${activeCycle.confidence ?? 0}%`,
    } : null,
    retryLogs: activeCycle.logs.map((l) => l.message),
  };
}

// Real-data counterpart to useDemoRunner: same HealingRunState shape (see
// src/types/healingRun.ts), driven by polling GET /runs/:id/live (in-memory,
// fast) and GET /runs/:id (DB-backed, authoritative once the run finishes)
// instead of a scripted timeline.
export function useLiveHealingRunner() {
  const [state, setState] = useState(initialState);
  const [reportStats, setReportStats] = useState(null);
  const runIdRef = useRef(null);
  const pollRef = useRef(null);
  const testCasesRef = useRef([]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  const reset = useCallback(() => {
    stopPolling();
    runIdRef.current = null;
    testCasesRef.current = [];
    setReportStats(null);
    setState(initialState);
  }, [stopPolling]);

  const poll = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    try {
      const [{ data: run }, { data: live }] = await Promise.all([
        runsApi.getById(runId),
        runsApi.getLive(runId).catch(() => ({ data: { run: null, healing: null } })),
      ]);

      testCasesRef.current = run.testCases || [];
      const failures = deriveFailures(testCasesRef.current);
      const suites = deriveSuites(live.run, testCasesRef.current);
      const isTerminal = !['running', 'pending'].includes(run.status) && run.status !== 'healing';

      let phase = 'running';
      if (run.status === 'healing' || live.healing) phase = 'healing';
      else if (isTerminal) phase = 'report';

      setState((s) => ({
        ...s,
        phase,
        suites,
        revealedFailures: failures.map((f) => f.key),
        healing: deriveHealing(live.healing, failures),
        healedKeys: testCasesRef.current.filter((tc) => tc.healing_status).map((tc) => tc.id),
        timelineCount: failures.length,
        showConfetti: isTerminal && run.failed === 0,
      }));

      if (isTerminal) {
        const totalTests = run.total_tests || 0;
        const healed = run.healed || 0;
        const notFixable = run.not_fixable || 0;
        const initiallyFailed = (run.failed || 0) + healed + notFixable;
        // Keys here must match ExecutiveReport's CARDS exactly (suitesExecuted,
        // tests, passed, initiallyFailed, aiHealed, manualInvestigation,
        // successRate, healingSuccess) — it indexes stats by these names
        // directly, so any mismatch silently renders that card as 0/blank.
        setReportStats({
          suitesExecuted: suites.length,
          tests: totalTests,
          passed: run.passed || 0,
          initiallyFailed,
          aiHealed: healed,
          manualInvestigation: notFixable,
          successRate: totalTests ? Math.round(((run.passed || 0) / totalTests) * 100) : 0,
          healingSuccess: (healed + notFixable) ? Math.round((healed / (healed + notFixable)) * 100) : 0,
        });
        stopPolling();
      }
    } catch {
      /* transient poll failure — next tick retries */
    }
  }, [stopPolling]);

  const attach = useCallback((runId) => {
    stopPolling();
    runIdRef.current = runId;
    setReportStats(null);
    setState({ ...initialState, phase: 'connecting', connectSteps: [{ text: 'Connected to run', done: true }] });
    poll();
    pollRef.current = setInterval(poll, POLL_MS);
  }, [poll, stopPolling]);

  const start = useCallback(async (suite = 'smoke') => {
    const { data } = await runsApi.create({ suite, trigger: 'manual' });
    attach(data.runId);
    return data.runId;
  }, [attach]);

  const failures = deriveFailures(testCasesRef.current);

  return { state, start, attach, reset, reportStats, timeline: [], failures };
}
