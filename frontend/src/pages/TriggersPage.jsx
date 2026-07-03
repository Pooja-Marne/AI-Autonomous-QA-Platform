import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, RefreshCw, Play, Radar, CheckCircle, XCircle, Clock, Plus, ExternalLink } from 'lucide-react';
import { triggersApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import JiraTriggerPrompt from '../components/JiraTriggerPrompt';
import { timeAgo } from '../utils/dateUtils';

const EVENT_LABELS = {
  bug_fixed: { label: 'Bug Fixed', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
  story_closed: { label: 'Story Closed', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  issue_resolved: { label: 'Issue Resolved', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
};

const DECISION_CONFIG = {
  run_tests: { label: 'Run Started', icon: Play, color: 'text-green-400' },
  dismissed: { label: 'Dismissed', icon: XCircle, color: 'text-gray-400' },
  null: { label: 'Pending', icon: Clock, color: 'text-yellow-400' },
};

export default function TriggersPage() {
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const navigate = useNavigate();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [pendingRes, historyRes] = await Promise.allSettled([
        triggersApi.getPending(),
        triggersApi.getHistory({ limit: 50 }),
      ]);
      if (pendingRes.status === 'fulfilled') setPending(pendingRes.value?.data || []);
      if (historyRes.status === 'fulfilled') setHistory(historyRes.value?.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handlePollNow = async () => {
    setPolling(true);
    try {
      const res = await triggersApi.pollNow();
      await load(true);
      if (res.data?.count > 0) {
        // new triggers appeared
      }
    } finally {
      setPolling(false);
    }
  };

  const handleManualTrigger = async (e) => {
    e.preventDefault();
    if (!manualKey.trim()) return;
    setSubmittingManual(true);
    try {
      await triggersApi.createManual(manualKey.trim().toUpperCase());
      setManualKey('');
      await load(true);
      setActiveTab('pending');
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleDecision = useCallback((triggerId, result) => {
    setPending((prev) => prev.filter((t) => t.id !== triggerId));
    load(true);
    if (result.action === 'run_started' && result.runId) {
      setTimeout(() => navigate(`/runs/${result.runId}`), 400);
    }
  }, [load, navigate]);

  if (loading) return <LoadingSpinner label="Loading Jira triggers..." />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-yellow-400" /> Jira Triggers
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Agent watches for closed stories & fixed bugs — asks you which tests to run
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => load(true)} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={handlePollNow} disabled={polling} className="btn-secondary">
            <Radar className={`w-4 h-4 ${polling ? 'animate-spin' : ''}`} />
            {polling ? 'Polling...' : 'Poll Jira Now'}
          </button>
        </div>
      </div>

      {/* How it works banner */}
      <div className="glass-card p-4 border-blue-500/20 bg-blue-500/5">
        <p className="text-xs font-semibold text-blue-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Radar className="w-3.5 h-3.5" /> How It Works
        </p>
        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
          <div className="flex items-start gap-1.5">
            <span className="text-blue-400 font-bold">1.</span>
            <span>Agent polls Jira every <strong className="text-white">2 minutes</strong> for issues moved to Done/Resolved</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="text-blue-400 font-bold">2.</span>
            <span>A prompt appears asking <strong className="text-white">you</strong> which test suite to run</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="text-blue-400 font-bold">3.</span>
            <span>Select a suite → AI executes + self-heals → <strong className="text-white">result linked back to Jira</strong></span>
          </div>
        </div>
      </div>

      {/* Manual trigger input */}
      <div className="glass-card p-4">
        <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">
          Manually create a trigger for any Jira issue key
        </p>
        <form onSubmit={handleManualTrigger} className="flex gap-2">
          <input
            type="text"
            value={manualKey}
            onChange={(e) => setManualKey(e.target.value.toUpperCase())}
            placeholder="e.g. SCRUM-1, SCRUM-42"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 font-mono focus:border-blue-500 focus:outline-none"
          />
          <button type="submit" disabled={submittingManual || !manualKey.trim()} className="btn-primary px-4">
            <Plus className="w-4 h-4" />
            {submittingManual ? 'Fetching...' : 'Create Trigger'}
          </button>
        </form>
        <p className="text-xs text-gray-600 mt-1.5">
          Fetches live issue details from Jira and creates the suite-selection prompt below.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'pending', label: `Pending Decision (${pending.length})` },
          { key: 'history', label: `All History (${history.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pending' && (
        <div>
          {pending.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <CheckCircle className="w-10 h-10 text-green-500/30 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No pending decisions</p>
              <p className="text-sm text-gray-600 mt-1">
                When a Jira story is closed or a bug is fixed, the agent will ask you here.
              </p>
              <button onClick={handlePollNow} disabled={polling} className="btn-secondary mt-4 mx-auto">
                <Radar className="w-4 h-4" /> Poll Jira Now
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {pending.map((trigger) => (
                <JiraTriggerPrompt
                  key={trigger.id}
                  triggers={[trigger]}
                  onDecision={handleDecision}
                  inline
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Jira Issue</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Event</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Decision</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Suite Run</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Test Run</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">When</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-gray-500 text-sm">No trigger history yet</td>
                </tr>
              ) : (
                history.map((t) => {
                  const evt = EVENT_LABELS[t.event_type] || EVENT_LABELS.issue_resolved;
                  const dec = DECISION_CONFIG[t.user_decision] || DECISION_CONFIG.null;
                  const DecIcon = dec.icon;
                  return (
                    <tr key={t.id} className="table-row">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-blue-400">{t.jira_key}</span>
                          <a href={t.jira_url} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-blue-400">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <p className="text-xs text-gray-400 truncate max-w-48">{t.jira_summary}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`badge border ${evt.bg} ${evt.color}`}>{evt.label}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`flex items-center gap-1 text-xs font-medium ${dec.color}`}>
                          <DecIcon className="w-3.5 h-3.5" />
                          {dec.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-400 capitalize">
                        {t.selected_suite?.replace('_', ' ') || '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        {t.run_id ? (
                          <button
                            onClick={() => navigate(`/runs/${t.run_id}`)}
                            className="text-xs text-blue-400 hover:text-blue-300 font-mono transition-colors"
                          >
                            {t.run_id.substring(0, 8)}...
                          </button>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-400">
                        {timeAgo(t.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
