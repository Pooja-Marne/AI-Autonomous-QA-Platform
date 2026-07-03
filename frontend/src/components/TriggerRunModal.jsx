import { useState } from 'react';
import { X, Play, Zap, FlaskConical, Bot } from 'lucide-react';
import { runsApi } from '../services/api';

const SIMULATED_SUITES = [
  { value: 'full_regression', label: 'Full Regression Suite', desc: 'All modules — uses your Jira stories as test cases' },
  { value: 'smoke',           label: 'Smoke Tests',           desc: '3 critical path checks' },
  { value: 'api',             label: 'API Test Suite',        desc: 'API endpoint tests' },
  { value: 'ui',              label: 'UI Test Suite',         desc: 'UI component tests' },
];

const PLAYWRIGHT_SUITES = [
  { value: 'smoke',     label: 'Smoke (@smoke)',        desc: 'Runs all tests tagged @smoke across every spec' },
  { value: 'login',     label: 'Login / Auth',          desc: 'playwright/specs/auth — login & logout flows' },
  { value: 'cart',      label: 'Cart Tests',            desc: 'playwright/specs/cart — cart add/remove/badge' },
  { value: 'checkout',  label: 'Checkout Flow',         desc: 'playwright/specs/checkout — full checkout steps' },
  { value: 'inventory', label: 'Inventory / Products',  desc: 'playwright/specs/inventory — sorting & detail pages' },
  { value: 'e2e',       label: 'End-to-End Purchase',   desc: 'playwright/specs/e2e — full purchase flows' },
  { value: 'full_regression', label: 'Full Regression (all)', desc: 'Run every Playwright spec (may take a while)' },
];

export default function TriggerRunModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('simulated');   // 'simulated' | 'playwright'
  const [suite, setSuite] = useState('full_regression');
  const [branch, setBranch] = useState('master');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const suites = mode === 'playwright' ? PLAYWRIGHT_SUITES : SIMULATED_SUITES;

  const handleModeChange = (m) => {
    setMode(m);
    setSuite(m === 'playwright' ? 'smoke' : 'full_regression');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await runsApi.create({
        suite,
        branch,
        trigger: 'manual',
        mode: mode === 'playwright' ? 'playwright' : undefined,
      });
      onSuccess?.(result.data);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Trigger Test Run</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">

          {/* Mode selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Runner Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleModeChange('simulated')}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${mode === 'simulated' ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Bot className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">Simulated</span>
                </div>
                <span className="text-xs text-gray-400">AI-generated runs from your Jira stories</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('playwright')}
                className={`flex flex-col items-start p-3 rounded-lg border text-left transition-colors ${mode === 'playwright' ? 'border-green-500 bg-green-500/10' : 'border-gray-700 hover:border-gray-600'}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <FlaskConical className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-medium text-white">Playwright</span>
                </div>
                <span className="text-xs text-gray-400">Run your real SauceDemo test specs</span>
              </button>
            </div>
            {mode === 'playwright' && (
              <p className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 mt-2">
                Runs actual <code>tests/playwright/specs/</code> files. Failures are sent to AI Healing automatically.
              </p>
            )}
          </div>

          {/* Suite selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Test Suite</label>
            <div className="space-y-2">
              {suites.map((s) => (
                <label
                  key={s.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${suite === s.value ? (mode === 'playwright' ? 'border-green-500 bg-green-500/10' : 'border-blue-500 bg-blue-500/10') : 'border-gray-700 hover:border-gray-600'}`}
                >
                  <input type="radio" name="suite" value={s.value} checked={suite === s.value} onChange={(e) => setSuite(e.target.value)} className="mt-0.5 accent-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-white">{s.label}</p>
                    <p className="text-xs text-gray-400">{s.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {mode === 'simulated' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Branch</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-blue-500 focus:outline-none"
                placeholder="master"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className={`flex-1 justify-center flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all ${mode === 'playwright' ? 'bg-green-600 hover:bg-green-500 text-white' : 'btn-primary'} disabled:opacity-50`}>
              {mode === 'playwright' ? <FlaskConical className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {loading ? 'Starting...' : mode === 'playwright' ? 'Run Playwright Tests' : 'Start Run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
