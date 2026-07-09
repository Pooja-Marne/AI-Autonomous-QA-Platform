import { useEffect, useState } from 'react';
import { RotateCcw, Sparkles, History } from 'lucide-react';
import clsx from 'clsx';
import { useLiveHealingRunner } from '../../hooks/useLiveHealingRunner';
import { useSuiteExecutionHistory } from '../../hooks/useSuiteExecutionHistory';
import { demoHealingApi } from '../../services/api';
import HealingRunView from '../../components/healing/HealingRunView';
import SuiteExecutionDetail from '../../components/healing/SuiteExecutionDetail';

const SUITES = [
  { key: 'smoke', label: 'Smoke' },
  { key: 'full_regression', label: 'Full Regression' },
  { key: 'login', label: 'Login' },
  { key: 'cart', label: 'Cart' },
  { key: 'checkout', label: 'Checkout' },
  { key: 'inventory', label: 'Inventory' },
];

export default function LiveHealingView() {
  const { state, start, reset, reportStats, timeline, failures } = useLiveHealingRunner();
  const history = useSuiteExecutionHistory();
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);

  // Once a newly-started live run finishes, refresh the execution history
  // for that suite so it shows up immediately without a manual reload.
  useEffect(() => {
    if (state.phase === 'report') history.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  const handleResetDemo = async () => {
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await demoHealingApi.reset();
      setResetMessage({ type: 'success', text: `Reset ${res.data?.length || 0} locator(s) — ready for another live run.` });
    } catch (err) {
      setResetMessage({ type: 'error', text: `Reset failed: ${err.message}` });
    } finally {
      setResetting(false);
      setTimeout(() => setResetMessage(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {state.phase === 'idle' && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400">Suite:</span>
            {SUITES.map((s) => (
              <button
                key={s.key}
                onClick={() => history.selectSuite(s.key)}
                title="Click to load this suite's latest AI Healing execution"
                className={clsx(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                  history.suite === s.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDemo}
              disabled={resetting}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors disabled:opacity-50"
              title="Re-break the demo bait locators so the next run has something real to heal"
            >
              <RotateCcw className={clsx('w-3.5 h-3.5', resetting && 'animate-spin')} />
              {resetting ? 'Resetting...' : 'Reset Demo Locators'}
            </button>
            <button
              onClick={() => start(history.suite || 'smoke')}
              className="btn-primary bg-purple-600 hover:bg-purple-500"
            >
              Run Regression
            </button>
          </div>
        </div>
      )}

      {resetMessage && (
        <p className={clsx('text-xs', resetMessage.type === 'success' ? 'text-green-400' : 'text-red-400')}>
          {resetMessage.text}
        </p>
      )}

      {state.phase !== 'idle' ? (
        <>
          <HealingRunView
            state={state}
            failures={failures}
            timeline={timeline}
            reportStats={reportStats}
            onStart={() => start(history.suite || 'smoke')}
            onReset={reset}
            startLabel="Run Regression"
            idleHint="Connecting..."
          />
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Live run — real regression execution, real AI analysis, real retry against the live app.
          </p>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
          <div className="glass-card p-4 space-y-2 lg:sticky lg:top-6 self-start">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <History className="w-3.5 h-3.5" /> Executions
            </h3>
            {history.loadingList && <p className="text-xs text-gray-500">Loading...</p>}
            {!history.loadingList && history.executions.length === 0 && (
              <p className="text-xs text-gray-500">Pick a suite above to browse its executions.</p>
            )}
            {history.executions.map((run) => (
              <button
                key={run.id}
                onClick={() => history.selectRun(run.id)}
                className={clsx(
                  'w-full text-left px-3 py-2 rounded-lg text-xs transition-colors',
                  history.selectedRunId === run.id ? 'bg-blue-600/20 border border-blue-500/40 text-white' : 'bg-gray-800/40 hover:bg-gray-800 text-gray-400'
                )}
              >
                <div className="font-medium truncate">{run.name}</div>
                <div className="text-gray-500 mt-0.5">
                  {run.started_at ? new Date(run.started_at).toLocaleString() : '—'}
                </div>
                <div className="mt-1 uppercase text-[10px] tracking-wide text-gray-500">{run.status?.replace(/_/g, ' ')}</div>
              </button>
            ))}
          </div>

          <SuiteExecutionDetail detail={history.detail} loading={history.loadingDetail} error={history.error} />
        </div>
      )}
    </div>
  );
}
