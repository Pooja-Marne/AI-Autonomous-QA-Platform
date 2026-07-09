import { useState } from 'react';
import { Wrench, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import LiveHealingView from './healing/LiveHealingView';
import HealingDemoView from './healing/HealingDemoView';

const MODES = [
  { key: 'live', label: 'Live' },
  { key: 'scripted', label: 'Scripted Demo' },
];

export default function AIHealingPage() {
  const [mode, setMode] = useState('live');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            {mode === 'live' ? <Wrench className="w-6 h-6 text-purple-400" /> : <Sparkles className="w-6 h-6 text-purple-400" />}
            AI Healing
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {mode === 'live' ? 'Real regression execution and self-healing, live' : 'Scripted walkthrough for presentations — no real app required'}
          </p>
        </div>
        <div className="flex gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                mode === m.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Both stay mounted (hidden via CSS, not unmounted) so switching modes
          mid-run doesn't reset an in-progress live or scripted run. */}
      <div className={mode === 'live' ? '' : 'hidden'}>
        <LiveHealingView />
      </div>
      <div className={mode === 'scripted' ? '' : 'hidden'}>
        <HealingDemoView />
      </div>
    </div>
  );
}
