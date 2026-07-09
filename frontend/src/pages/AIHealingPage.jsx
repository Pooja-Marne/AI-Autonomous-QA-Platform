import { useState } from 'react';
import { Wrench, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import HealingCenterView from './healing/HealingCenterView';
import HealingDemoView from './healing/HealingDemoView';

const TABS = [
  { key: 'center', label: 'AI Healing Center' },
  { key: 'demo', label: 'AI Healing Demo' },
];

export default function AIHealingPage() {
  const [tab, setTab] = useState('center');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            {tab === 'center' ? <Wrench className="w-6 h-6 text-purple-400" /> : <Sparkles className="w-6 h-6 text-purple-400" />}
            AI Healing
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {tab === 'center' ? 'Detect, fix, and verify test failures with AI' : 'Scripted walkthrough for live presentations'}
          </p>
        </div>
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={clsx(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Both stay mounted (hidden via CSS, not unmounted) so switching tabs
          mid-demo doesn't reset the scripted run in progress. */}
      <div className={tab === 'center' ? '' : 'hidden'}>
        <HealingCenterView />
      </div>
      <div className={tab === 'demo' ? '' : 'hidden'}>
        <HealingDemoView />
      </div>
    </div>
  );
}
