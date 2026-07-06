import { useCallback, useRef, useState } from 'react';
import {
  SUITES, SUITE_LOGS, FAILURES, HEALING_THOUGHT_STEPS, RCA_THOUGHT_STEPS,
  HEALING_RESULTS, HEALING_RETRY_LOGS, TIMELINE, REPORT_STATS,
} from '../data/demoScript';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const initialState = {
  phase: 'idle', // idle | connecting | running | failures | healing | report
  connectSteps: [],
  suites: SUITES.map((s) => ({ ...s, status: 'pending', progress: 0, logs: [] })),
  revealedFailures: [],
  healing: null, // { key, title, stepIndex, steps, result, retryLogs }
  healedKeys: [],
  timelineCount: 0,
  showConfetti: false,
};

// Drives the entire scripted demo. All timing lives here so the presentation
// components stay dumb/reusable — they just render whatever state this
// returns. A run token guards against stale timers after reset()/unmount.
export function useDemoRunner() {
  const [state, setState] = useState(initialState);
  const runTokenRef = useRef(0);

  const reset = useCallback(() => {
    runTokenRef.current += 1;
    setState(initialState);
  }, []);

  const start = useCallback(async () => {
    runTokenRef.current += 1;
    const myToken = runTokenRef.current;
    const isCurrent = () => runTokenRef.current === myToken;

    setState({ ...initialState, phase: 'connecting' });

    // ── Connecting to Jira ──────────────────────────────────────────
    const connectScript = [
      { text: 'Connecting to Jira...', done: false },
      { text: '✓ Stories Loaded', done: true },
      { text: 'Checking Sprint...', done: false },
      { text: '✓ Sprint Ready', done: true },
    ];
    for (let i = 0; i < connectScript.length; i++) {
      await sleep(i === 0 ? 500 : 700);
      if (!isCurrent()) return;
      setState((s) => ({ ...s, connectSteps: connectScript.slice(0, i + 1) }));
    }
    await sleep(500);
    if (!isCurrent()) return;

    // ── Running Regression (per suite) ─────────────────────────────
    setState((s) => ({ ...s, phase: 'running' }));
    for (const suite of SUITES) {
      if (!isCurrent()) return;
      setState((s) => ({
        ...s,
        suites: s.suites.map((x) => (x.key === suite.key ? { ...x, status: 'running' } : x)),
      }));

      const logs = SUITE_LOGS[suite.key] || [];
      for (let i = 0; i < logs.length; i++) {
        await sleep(280);
        if (!isCurrent()) return;
        const progress = Math.round(((i + 1) / logs.length) * 100);
        setState((s) => ({
          ...s,
          suites: s.suites.map((x) =>
            x.key === suite.key ? { ...x, logs: logs.slice(0, i + 1), progress } : x
          ),
        }));
      }

      const failed = FAILURES.some((f) => f.key === suite.key);
      await sleep(200);
      if (!isCurrent()) return;
      setState((s) => ({
        ...s,
        suites: s.suites.map((x) =>
          x.key === suite.key ? { ...x, status: failed ? 'failed' : 'passed' } : x
        ),
      }));
    }

    await sleep(600);
    if (!isCurrent()) return;

    // ── Reveal failures ─────────────────────────────────────────────
    setState((s) => ({ ...s, phase: 'failures' }));
    for (const failure of FAILURES) {
      await sleep(600);
      if (!isCurrent()) return;
      setState((s) => ({ ...s, revealedFailures: [...s.revealedFailures, failure.key] }));
    }

    await sleep(900);
    if (!isCurrent()) return;

    // ── AI Healing, one failure at a time ───────────────────────────
    setState((s) => ({ ...s, phase: 'healing', timelineCount: 2 })); // Started + Login Failed
    for (const failure of FAILURES) {
      if (!isCurrent()) return;
      const steps = failure.healable ? HEALING_THOUGHT_STEPS : RCA_THOUGHT_STEPS;

      setState((s) => ({
        ...s,
        healing: { key: failure.key, title: failure.title, healable: failure.healable, stepIndex: 0, steps, result: null, retryLogs: [] },
      }));

      for (let i = 0; i < steps.length; i++) {
        await sleep(550);
        if (!isCurrent()) return;
        setState((s) => ({ ...s, healing: { ...s.healing, stepIndex: i + 1 } }));
      }

      await sleep(400);
      if (!isCurrent()) return;

      if (failure.healable) {
        const result = HEALING_RESULTS[failure.key];
        setState((s) => ({ ...s, healing: { ...s.healing, result } }));

        const retryLogs = HEALING_RETRY_LOGS[failure.key] || [];
        for (let i = 0; i < retryLogs.length; i++) {
          await sleep(450);
          if (!isCurrent()) return;
          setState((s) => ({ ...s, healing: { ...s.healing, retryLogs: retryLogs.slice(0, i + 1) } }));
        }

        await sleep(500);
        if (!isCurrent()) return;
        setState((s) => ({
          ...s,
          healedKeys: [...s.healedKeys, failure.key],
          timelineCount: Math.min(s.timelineCount + 3, TIMELINE.length),
        }));
      } else {
        const result = HEALING_RESULTS[failure.key];
        setState((s) => ({ ...s, healing: { ...s.healing, result } }));
        await sleep(1200);
        if (!isCurrent()) return;
        setState((s) => ({
          ...s,
          healedKeys: [...s.healedKeys, failure.key],
          timelineCount: Math.min(s.timelineCount + 3, TIMELINE.length),
        }));
      }

      await sleep(900);
      if (!isCurrent()) return;
    }

    // ── Executive report ────────────────────────────────────────────
    await sleep(600);
    if (!isCurrent()) return;
    setState((s) => ({ ...s, phase: 'report', timelineCount: TIMELINE.length, showConfetti: true }));
  }, []);

  return { state, start, reset, reportStats: REPORT_STATS, timeline: TIMELINE };
}
