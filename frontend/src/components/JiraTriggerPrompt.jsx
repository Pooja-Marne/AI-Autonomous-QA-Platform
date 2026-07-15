import { useState } from 'react';
import { Bug, BookOpen, CheckSquare, Play, X, ChevronRight, Zap, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { triggersApi } from '../services/api';

const SUITES = [
  {
    value: 'full_regression',
    label: 'Full Regression',
    desc: 'Every Playwright spec — auth, cart, checkout, inventory, e2e',
    icon: '🔁',
    recommended: true,
  },
  {
    value: 'smoke',
    label: 'Smoke Tests',
    desc: 'Tests tagged @smoke — fastest pass/fail signal',
    icon: '💨',
  },
  {
    value: 'regression',
    label: 'Regression Suite',
    desc: 'Tests tagged @regression',
    icon: '🧪',
  },
];

const TYPE_CONFIG = {
  Bug: { icon: Bug, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', label: 'Bug Fixed', verb: 'fixed' },
  Story: { icon: BookOpen, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', label: 'Story Closed', verb: 'closed' },
  Task: { icon: CheckSquare, color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', label: 'Task Done', verb: 'completed' },
};

function SingleTriggerCard({ trigger, onDecision }) {
  const [selectedSuite, setSelectedSuite] = useState('full_regression');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('choose'); // 'choose' | 'confirm'

  const typeConfig = TYPE_CONFIG[trigger.jira_type] || TYPE_CONFIG.Task;
  const TypeIcon = typeConfig.icon;

  const handleRun = async () => {
    setLoading(true);
    try {
      const res = await triggersApi.respond(trigger.id, {
        decision: 'run_tests',
        suite: selectedSuite,
      });
      onDecision(trigger.id, { action: 'run_started', ...res.data });
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    await triggersApi.respond(trigger.id, { decision: 'dismiss' });
    onDecision(trigger.id, { action: 'dismissed' });
  };

  return (
    <div className={clsx('glass-card border', typeConfig.bg, 'overflow-hidden')}>
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between border-b border-white/5">
        <div className="flex items-start gap-3">
          <div className={clsx('p-2 rounded-lg', typeConfig.bg)}>
            <TypeIcon className={clsx('w-4 h-4', typeConfig.color)} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={clsx('text-xs font-bold uppercase tracking-wider', typeConfig.color)}>
                {typeConfig.label}
              </span>
              <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded font-mono">
                {trigger.jira_key}
              </span>
            </div>
            <p className="text-sm font-semibold text-white leading-tight">{trigger.jira_summary}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {trigger.jira_priority} · {trigger.jira_assignee} · now {trigger.jira_status}
            </p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-gray-600 hover:text-gray-400 transition-colors p-1 flex-shrink-0"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Agent Prompt */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-2 mb-4">
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="bg-gray-800/80 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-200 leading-relaxed">
            The Jira {trigger.jira_type?.toLowerCase()} <span className={clsx('font-semibold', typeConfig.color)}>{trigger.jira_key}</span> has been <span className="font-semibold text-white">{typeConfig.verb}</span>.
            Would you like to run a regression test to validate this change?
            <span className="block mt-1 text-gray-400 text-xs">Select a test suite below or dismiss.</span>
          </div>
        </div>

        {/* Suite Selection */}
        <div className="space-y-2 mb-4">
          {SUITES.map((suite) => {
            const showRecommended = suite.recommended;
            return (
            <label
              key={suite.value}
              className={clsx(
                'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                selectedSuite === suite.value
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700/60 hover:border-gray-600 bg-gray-800/30'
              )}
            >
              <input
                type="radio"
                name={`suite-${trigger.id}`}
                value={suite.value}
                checked={selectedSuite === suite.value}
                onChange={() => setSelectedSuite(suite.value)}
                className="accent-blue-500 flex-shrink-0"
              />
              <span className="text-base leading-none">{suite.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{suite.label}</span>
                  {showRecommended && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.5 rounded-full">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{suite.desc}</p>
              </div>
              {selectedSuite === suite.value && (
                <ChevronRight className="w-4 h-4 text-blue-400 flex-shrink-0" />
              )}
            </label>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleDismiss}
            className="btn-secondary flex-1 justify-center py-2"
          >
            Skip for now
          </button>
          <button
            onClick={handleRun}
            disabled={loading}
            className="btn-primary flex-1 justify-center py-2"
          >
            <Play className="w-4 h-4" />
            {loading ? 'Starting...' : `Run ${SUITES.find(s => s.value === selectedSuite)?.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JiraTriggerPrompt({ triggers, onDecision, inline = false }) {
  if (!triggers || triggers.length === 0) return null;

  // Inline mode: render directly in page (used by TriggersPage)
  if (inline) {
    return (
      <div className="space-y-3">
        {triggers.map((t) => (
          <SingleTriggerCard key={t.id} trigger={t} onDecision={onDecision} />
        ))}
      </div>
    );
  }

  // Floating overlay mode: fixed bottom-right (used globally from App.jsx)
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-3 max-w-md w-full">
      {triggers.length > 1 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900/90 border border-gray-700 rounded-full text-xs text-gray-400 backdrop-blur-sm">
          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
          <span>{triggers.length} Jira events pending your decision</span>
        </div>
      )}
      <SingleTriggerCard
        key={triggers[0].id}
        trigger={triggers[0]}
        onDecision={onDecision}
      />
    </div>
  );
}
