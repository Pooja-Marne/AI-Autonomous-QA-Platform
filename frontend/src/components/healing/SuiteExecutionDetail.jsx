import { Loader2, AlertTriangle, XCircle, Sparkles, ShieldOff, Clock } from 'lucide-react';
import clsx from 'clsx';
import DemoHealingRunCard from '../DemoHealingRunCard';

const STATUS_STYLES = {
  passed: 'text-green-400 bg-green-500/10 border-green-500/20',
  partially_healed: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  failed: 'text-red-400 bg-red-500/10 border-red-500/20',
  running: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  healing: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
};

function StatCard({ label, value, className }) {
  return (
    <div className="bg-gray-800/40 rounded-lg p-3 text-center">
      <div className={clsx('text-2xl font-bold', className)}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

export default function SuiteExecutionDetail({ detail, loading, error }) {
  if (loading) {
    return (
      <div className="glass-card p-10 text-center text-gray-500 flex flex-col items-center gap-2">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Loading execution details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-6 border border-red-500/20 bg-red-500/5 text-center">
        <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-400">Failed to load execution: {error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="glass-card p-10 text-center text-gray-500">
        <ShieldOff className="w-8 h-8 mx-auto mb-2 text-gray-600" />
        <p className="text-sm">No AI Healing data available for this execution.</p>
      </div>
    );
  }

  const failedCases = (detail.testCases || []).filter((tc) => tc.status === 'failed');
  const notHealed = (detail.not_fixable ?? 0);

  return (
    <div className="space-y-4">
      <div className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h3 className="text-base font-semibold text-white">{detail.name || detail.suite}</h3>
            <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-0.5">
              <Clock className="w-3.5 h-3.5" />
              {detail.started_at ? new Date(detail.started_at).toLocaleString() : '—'}
              {detail.duration_ms ? ` · ${(detail.duration_ms / 1000).toFixed(1)}s` : ''}
            </p>
          </div>
          <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full border uppercase', STATUS_STYLES[detail.status] || 'text-gray-400 bg-gray-500/10 border-gray-500/20')}>
            {detail.status?.replace(/_/g, ' ')}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Total Tests" value={detail.total_tests ?? 0} className="text-white" />
          <StatCard label="Passed" value={detail.passed ?? 0} className="text-green-400" />
          <StatCard label="Failed" value={detail.failed ?? 0} className="text-red-400" />
          <StatCard label="Healed" value={detail.healed ?? 0} className="text-purple-400" />
          <StatCard label="Not Healed" value={notHealed} className="text-orange-400" />
        </div>
      </div>

      {failedCases.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400" /> Error Messages
          </h3>
          <div className="space-y-2">
            {failedCases.map((tc) => (
              <div key={tc.id} className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                <p className="text-xs font-medium text-white">{tc.name}</p>
                <p className="text-xs text-red-400 font-mono mt-1">{tc.error_message || 'No error message captured.'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {detail.executionLogs?.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Runtime Logs</h3>
          <div className="bg-black/50 rounded-lg p-3 font-mono text-xs space-y-0.5 max-h-64 overflow-y-auto">
            {detail.executionLogs.map((l, i) => (
              <div key={i} className="text-gray-400">{l}</div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" /> AI Healing
        </h3>
        {detail.demoHealingRuns?.length > 0 ? (
          <div className="space-y-2">
            {detail.demoHealingRuns.map((run) => <DemoHealingRunCard key={run.id} run={run} />)}
          </div>
        ) : (
          <div className="glass-card p-8 text-center text-gray-500">
            <p className="text-sm">No AI Healing data available for this execution.</p>
          </div>
        )}
      </div>
    </div>
  );
}
