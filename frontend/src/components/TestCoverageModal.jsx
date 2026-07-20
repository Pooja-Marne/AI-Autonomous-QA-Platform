import { useState, useEffect, useCallback } from 'react';
import { Radar, X, Loader2, AlertTriangle, CheckCircle2, ChevronDown, Ban } from 'lucide-react';
import clsx from 'clsx';
import { coverageApi } from '../services/api';
import StatusBadge from './StatusBadge';

export default function TestCoverageModal({ jiraKey, jiraSummary, triggerId, onClose }) {
  const [recommendations, setRecommendations] = useState(null); // null = not yet loaded
  const [overallStatus, setOverallStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [showCovered, setShowCovered] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await coverageApi.get(jiraKey);
      const rows = res.data || [];
      setRecommendations(rows);
      setOverallStatus(rows[0]?.overall_status || null);
    } finally {
      setLoading(false);
    }
  }, [jiraKey]);

  useEffect(() => { load(); }, [load]);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const res = await coverageApi.analyze(jiraKey, triggerId);
      if (res.data?.degraded) {
        setError(res.data.reason || 'AI analysis is currently unavailable.');
        setRecommendations([]);
      } else {
        setRecommendations(res.data.recommendations || []);
        setOverallStatus(res.data.overallStatus || null);
      }
    } catch (err) {
      setError(err.message || 'Failed to analyze coverage');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDismiss = async (id) => {
    await coverageApi.dismiss(id);
    setRecommendations((prev) => prev.map((r) => (r.id === id ? { ...r, dismissed: 1 } : r)));
  };

  const allGaps = (recommendations || []).filter((r) => r.coverage_status === 'gap');
  const gaps = allGaps.filter((r) => !r.dismissed);
  const dismissedCount = allGaps.length - gaps.length;
  const covered = (recommendations || []).filter((r) => r.coverage_status === 'covered');
  const hasAnalysis = recommendations && recommendations.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Radar className="w-5 h-5 text-blue-400" />
              Test Coverage Analysis
            </h2>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">{jiraKey} — {jiraSummary}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 overflow-y-auto space-y-4">
          {loading ? (
            <div className="text-center py-10 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading previous analysis...</p>
            </div>
          ) : !hasAnalysis ? (
            <div className="text-center py-10">
              <Radar className="w-8 h-8 mx-auto mb-3 text-blue-500/40" />
              <p className="text-sm text-gray-400 mb-4">
                No coverage analysis yet. The AI will read this issue and compare it against the real Playwright test suite to find missing scenarios.
              </p>
              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4 inline-block">{error}</p>
              )}
              <button onClick={handleAnalyze} disabled={analyzing} className="btn-primary mx-auto">
                {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
                {analyzing ? 'Analyzing...' : 'Analyze Test Coverage'}
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <StatusBadge status={overallStatus} />
                <button onClick={handleAnalyze} disabled={analyzing} className="btn-secondary py-1.5 text-xs">
                  {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
                  {analyzing ? 'Re-analyzing...' : 'Re-analyze'}
                </button>
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
              )}

              {/* Missing Coverage */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" /> Missing Coverage ({gaps.length})
                </p>
                {gaps.length === 0 ? (
                  <div className="glass-card p-4 text-center text-sm text-gray-500">
                    {dismissedCount > 0
                      ? `No remaining gaps — ${dismissedCount} recommendation${dismissedCount > 1 ? 's' : ''} dismissed.`
                      : 'No gaps found — every scenario is covered.'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {gaps.map((r) => (
                      <div key={r.id} className="glass-card p-3.5 border border-yellow-500/20 bg-yellow-500/5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white">{r.title}</span>
                            {r.module && (
                              <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded font-mono flex-shrink-0">{r.module}</span>
                            )}
                          </div>
                          {r.rationale && <p className="text-xs text-gray-400">{r.rationale}</p>}
                        </div>
                        <button
                          onClick={() => handleDismiss(r.id)}
                          title="Dismiss this recommendation"
                          className="text-gray-600 hover:text-gray-400 transition-colors flex-shrink-0 p-1"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Already Covered (collapsed) */}
              {covered.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowCovered((v) => !v)}
                    className="text-xs text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5 hover:text-gray-400 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    Already Covered ({covered.length})
                    <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', showCovered && 'rotate-180')} />
                  </button>
                  {showCovered && (
                    <div className="space-y-2">
                      {covered.map((r) => (
                        <div key={r.id} className="glass-card p-3 border border-green-500/10 bg-green-500/5">
                          <p className="text-sm text-gray-300">{r.title}</p>
                          {r.matched_existing_test && (
                            <p className="text-xs text-green-400/80 mt-0.5 font-mono truncate">✓ {r.matched_existing_test}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
