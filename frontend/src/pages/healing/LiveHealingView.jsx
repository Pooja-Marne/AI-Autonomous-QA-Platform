import { useState } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { useLiveHealingRunner } from '../../hooks/useLiveHealingRunner';
import { demoHealingApi } from '../../services/api';
import HealingRunView from '../../components/healing/HealingRunView';

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
  const [suite, setSuite] = useState('smoke');
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState(null);

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
    <div className="space-y-4">
      {state.phase === 'idle' && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Suite:</span>
            {SUITES.map((s) => (
              <button
                key={s.key}
                onClick={() => setSuite(s.key)}
                className={clsx(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                  suite === s.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleResetDemo}
            disabled={resetting}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors disabled:opacity-50"
            title="Re-break the demo bait locators so the next run has something real to heal"
          >
            <RotateCcw className={clsx('w-3.5 h-3.5', resetting && 'animate-spin')} />
            {resetting ? 'Resetting...' : 'Reset Demo Locators'}
          </button>
        </div>
      )}

      {resetMessage && (
        <p className={clsx('text-xs', resetMessage.type === 'success' ? 'text-green-400' : 'text-red-400')}>
          {resetMessage.text}
        </p>
      )}

      <HealingRunView
        state={state}
        failures={failures}
        timeline={timeline}
        reportStats={reportStats}
        onStart={() => start(suite)}
        onReset={reset}
        startLabel="Run Regression"
        idleHint={(
          <>Click <span className="text-purple-400 font-medium">Run Regression</span> to execute the real Playwright suite against the live app — failures are detected and self-healed in real time.</>
        )}
      />

      {state.phase !== 'idle' && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-purple-400" /> Live run — real regression execution, real AI analysis, real retry against the live app.
        </p>
      )}
    </div>
  );
}
