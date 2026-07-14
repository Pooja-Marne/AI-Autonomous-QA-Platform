import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Clock, Camera, FileCode, ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, Code2 } from 'lucide-react';
import clsx from 'clsx';

const STATUS_CONFIG = {
  healed: { label: '✓ Fixed', classes: 'text-green-400 bg-green-500/10 border-green-500/20' },
  not_fixable: { label: '✗ Manual Investigation Required', classes: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

const FAILURE_TYPE_LABELS = {
  broken_locator: 'Broken Locator',
  page_changed: 'Page Changed',
  element_hidden: 'Element Hidden',
  dynamic_dom: 'Dynamic DOM',
  timing_issue: 'Timing Issue',
  network_issue: 'Network Issue',
  api_failure: 'API Failure',
  authentication_issue: 'Authentication Issue',
  assertion_failure: 'Assertion Failure',
};

export default function DemoHealingRunCard({ run }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_CONFIG[run.healing_status] || STATUS_CONFIG.not_fixable;

  return (
    <div className="glass-card border border-purple-500/10 overflow-hidden">
      <button onClick={() => setExpanded((e) => !e)} className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-800/20 transition-colors">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">{run.locator_key}</span>
            {run.failure_type && (
              <span className="text-xs font-medium text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                {FAILURE_TYPE_LABELS[run.failure_type] || run.failure_type}
              </span>
            )}
            <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full border', status.classes)}>{status.label}</span>
            {run.live_verified ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-400"><ShieldCheck className="w-3 h-3" /> Live-verified</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-gray-500"><ShieldAlert className="w-3 h-3" /> Not verified</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 font-mono truncate">{run.test_file}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {run.time_taken_ms}ms</span>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-800/60 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 bg-gray-900/60 border border-gray-800 rounded-lg p-3">
            <div>
              <p className="text-xs text-gray-500 mb-1">Broken Locator</p>
              <code className="text-xs text-red-400 break-all">{run.old_locator}</code>
            </div>
            <span className="text-gray-600 hidden sm:block">→</span>
            <div>
              <p className="text-xs text-gray-500 mb-1">AI-Generated Locator</p>
              <code className="text-xs text-green-400 break-all">{run.new_locator || '—'}</code>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-800/40 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">Confidence Score</p>
              <p className="text-lg font-bold text-blue-400">{run.confidence_score ?? '—'}%</p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">Retry Result</p>
              <p className={clsx('text-lg font-bold', run.retry_status === 'passed' ? 'text-green-400' : run.retry_status === 'failed' ? 'text-red-400' : 'text-gray-500')}>
                {run.retry_status?.toUpperCase() || 'SKIPPED'}
              </p>
            </div>
            <div className="bg-gray-800/40 rounded-lg p-2.5">
              <p className="text-xs text-gray-500">Attempts</p>
              <p className="text-lg font-bold text-gray-200">{run.attempts ?? '—'}</p>
            </div>
          </div>

          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
            <p className="text-xs font-medium text-purple-400 mb-1">Root Cause Analysis</p>
            <p className="text-xs text-purple-200">{run.root_cause}</p>
          </div>

          {run.code_snippet && (
            <div className="bg-black/50 rounded-lg p-2.5">
              <p className="text-xs font-medium text-gray-400 mb-1 flex items-center gap-1"><Code2 className="w-3.5 h-3.5" /> Applied Fix</p>
              <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">{run.code_snippet}</pre>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {run.screenshot_path && (
              <a href={`/demo-artifacts/${run.screenshot_path}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1.5 rounded-lg transition-colors">
                <Camera className="w-3.5 h-3.5" /> Screenshot
              </a>
            )}
            {run.dom_snapshot_path && (
              <a href={`/demo-artifacts/${run.dom_snapshot_path}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1.5 rounded-lg transition-colors">
                <FileCode className="w-3.5 h-3.5" /> DOM Snapshot
              </a>
            )}
            {run.trace_path && (
              <a href={`/demo-artifacts/${run.trace_path}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-2.5 py-1.5 rounded-lg transition-colors">
                <FileCode className="w-3.5 h-3.5" /> Trace
              </a>
            )}
          </div>

          {run.logs?.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Runtime Log</p>
              <div className="bg-black/50 rounded-lg p-2.5 font-mono text-xs space-y-1 max-h-56 overflow-y-auto">
                {run.logs.map((l, i) => (
                  <div key={i} className="text-gray-400">
                    <span className="text-gray-600 mr-2">{new Date(l.ts).toLocaleTimeString()}</span>{l.message}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
