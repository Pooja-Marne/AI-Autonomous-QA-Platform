import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import {
  Sparkles, Play, RotateCcw, CheckCircle2, XCircle, Loader2,
  Zap, FileCheck, ClipboardList,
} from 'lucide-react';
import clsx from 'clsx';
import { useDemoRunner } from '../hooks/useDemoRunner';
import { FAILURES, HEALING_THOUGHT_STEPS, RCA_THOUGHT_STEPS, HEALING_RESULTS, HEALING_RETRY_LOGS } from '../data/demoScript';
import SuiteProgress from '../components/demo/SuiteProgress';
import LogConsole from '../components/demo/LogConsole';
import HealingCard from '../components/demo/HealingCard';
import AITimeline from '../components/demo/AITimeline';
import AIChatBubble from '../components/demo/AIChatBubble';
import ExecutiveReport from '../components/demo/ExecutiveReport';

const PHASE_LABEL = {
  idle: null,
  connecting: 'Connecting',
  running: 'Running Regression',
  failures: 'Failures Detected',
  healing: 'AI Healing',
  report: 'Executive Report',
};

function buildCompletedHealing(failure) {
  const steps = failure.healable ? HEALING_THOUGHT_STEPS : RCA_THOUGHT_STEPS;
  return {
    key: failure.key,
    title: failure.title,
    healable: failure.healable,
    stepIndex: steps.length,
    steps,
    result: HEALING_RESULTS[failure.key],
    retryLogs: failure.healable ? (HEALING_RETRY_LOGS[failure.key] || []) : [],
  };
}

function PhaseBadge({ phase }) {
  const label = PHASE_LABEL[phase];
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/20">
      <Loader2 className={clsx('w-3 h-3', phase !== 'report' && 'animate-spin')} />
      {label}
    </span>
  );
}

function ConnectingPanel({ steps }) {
  return (
    <div className="glass-card p-6 max-w-md mx-auto space-y-3">
      {steps.map((s, i) => (
        <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 text-sm">
          {s.done ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
          <span className={s.done ? 'text-green-400 font-medium' : 'text-gray-300'}>{s.text}</span>
        </motion.div>
      ))}
    </div>
  );
}

function FailureCard({ failure, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className="glass-card p-4 border border-red-500/20 flex items-start gap-3"
    >
      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-white">{failure.title}</p>
        <p className="text-xs text-gray-500">{failure.suite}</p>
        <p className="text-xs text-red-400 mt-1">Reason: {failure.reason}</p>
      </div>
    </motion.div>
  );
}

export default function DemoModePage() {
  const { state, start, reset, reportStats, timeline } = useDemoRunner();
  const [confettiFired, setConfettiFired] = useState(false);
  const runningLogsRef = useRef(null);

  useEffect(() => {
    if (state.phase === 'report' && state.showConfetti && !confettiFired) {
      setConfettiFired(true);
      const duration = 2000;
      const end = Date.now() + duration;
      (function frame() {
        confetti({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0 }, colors: ['#22c55e', '#3b82f6', '#a855f7'] });
        confetti({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1 }, colors: ['#22c55e', '#3b82f6', '#a855f7'] });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    }
    if (state.phase === 'idle') setConfettiFired(false);
  }, [state.phase, state.showConfetti, confettiFired]);

  const activeSuite = state.suites.find((s) => s.status === 'running');
  const isRunning = state.phase !== 'idle' && state.phase !== 'report';
  const currentHealingKey = state.healing?.key;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-400" /> AI Healing Demo
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Scripted walkthrough of autonomous failure detection, root-cause analysis, and self-healing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PhaseBadge phase={state.phase} />
          {state.phase === 'idle' ? (
            <button onClick={start} className="btn-primary bg-purple-600 hover:bg-purple-500">
              <Play className="w-4 h-4" /> Run Demo
            </button>
          ) : (
            <button onClick={reset} disabled={isRunning} className="btn-secondary disabled:opacity-40">
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
          )}
        </div>
      </div>

      {state.phase === 'idle' && (
        <div className="glass-card p-12 text-center text-gray-500 max-w-xl mx-auto">
          <Zap className="w-10 h-10 mx-auto mb-3 text-purple-500/50" />
          <p className="text-sm">Click <span className="text-purple-400 font-medium">Run Demo</span> to simulate a full regression run, live AI failure analysis, and self-healing — no real app required.</p>
        </div>
      )}

      <AnimatePresence>
        {state.phase === 'connecting' && (
          <motion.div key="connecting" exit={{ opacity: 0 }}>
            <ConnectingPanel steps={state.connectSteps} />
          </motion.div>
        )}
      </AnimatePresence>

      {(state.phase === 'running' || state.phase === 'failures' || state.phase === 'healing' || state.phase === 'report') && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Regression Execution</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SuiteProgress suites={state.suites} />
            <LogConsole
              lines={activeSuite?.logs || state.suites.find((s) => s.status !== 'pending')?.logs || []}
              active={!!activeSuite}
              height="h-40"
            />
          </div>
        </motion.div>
      )}

      {(state.phase === 'failures' || state.phase === 'healing' || state.phase === 'report') && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">Failed Test Cases</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FAILURES.filter((f) => state.revealedFailures.includes(f.key)).map((f, i) => (
              <FailureCard key={f.key} failure={f} index={i} />
            ))}
          </div>
        </div>
      )}

      {(state.phase === 'healing' || state.phase === 'report') && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-white">AI Analysis &amp; Healing</h2>
          {FAILURES.map((f) => {
            const isLive = currentHealingKey === f.key;
            const isDone = state.healedKeys.includes(f.key);
            if (!isLive && !isDone) return null;
            const healing = isLive ? state.healing : buildCompletedHealing(f);
            return <HealingCard key={f.key} healing={healing} />;
          })}

          {/* Live AI reasoning, chat-style */}
          {state.healing?.result && (
            <div className="pt-2">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">AI Reasoning</p>
              <AIChatBubble text={state.healing.result.reasoning} />
            </div>
          )}
        </div>
      )}

      {(state.phase === 'healing' || state.phase === 'report') && (
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-400" /> AI Timeline
          </h2>
          <AITimeline events={timeline} count={state.timelineCount} />
        </div>
      )}

      <AnimatePresence>
        {state.phase === 'report' && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-green-400" /> Executive AI Report — Regression Summary
            </h2>
            <ExecutiveReport stats={reportStats} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
