import { useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useLiveHealingRunner } from '../../hooks/useLiveHealingRunner';
import HealingRunView from './HealingRunView';

/** Modal wrapper around the shared live run view — used by the Jira trigger
 * popup so a triggered run's healing timeline plays out in place instead of
 * navigating the user away. Same components/animations as the AI Healing
 * page and the scripted demo. */
export default function LiveHealingModal({ runId, onClose }) {
  const { state, reset, reportStats, timeline, failures, attach } = useLiveHealingRunner();

  useEffect(() => {
    attach(runId);
    return () => reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-card w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 relative">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" /> Live Regression &amp; AI Healing
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <HealingRunView
          state={state}
          failures={failures}
          timeline={timeline}
          reportStats={reportStats}
          onStart={() => {}}
          onReset={onClose}
          idleHint="Connecting to the run..."
        />
      </div>
    </div>
  );
}
