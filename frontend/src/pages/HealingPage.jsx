import { useState, useEffect } from 'react';
import { Wrench, RefreshCw, Brain, CheckCircle, XCircle, Zap, Ticket, ExternalLink, Filter, Info } from 'lucide-react';
import { healingApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';

const PRIORITY_COLORS = {
  Highest: 'text-red-400',
  High: 'text-orange-400',
  Medium: 'text-yellow-400',
  Low: 'text-blue-400',
  Lowest: 'text-gray-400',
};

function HealingActionCard({ action }) {
  const [expanded, setExpanded] = useState(false);
  const hasJira = !!action.jira_issue_key;

  return (
    <div
      className={`border-b border-gray-800/50 last:border-0 transition-colors ${hasJira ? 'hover:bg-blue-900/10' : 'hover:bg-gray-800/20'}`}
    >
      {/* Collapsed row */}
      <div
        className="px-4 py-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Jira badge */}
              {hasJira ? (
                <a
                  href={action.jira_url || '#'}
                  target={action.jira_url ? '_blank' : '_self'}
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs font-mono text-blue-400 hover:text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded transition-colors"
                  title={action.jira_summary}
                >
                  <Ticket className="w-3 h-3" />
                  {action.jira_issue_key}
                  {action.jira_url && <ExternalLink className="w-2.5 h-2.5 opacity-60" />}
                </a>
              ) : (
                <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded italic">No Jira link</span>
              )}
              <StatusBadge status={action.failure_type || 'unknown'} />
              <span className={`text-xs font-medium ${action.success ? 'text-green-400' : 'text-red-400'}`}>
                {action.success ? '✓ Healed' : '✗ Not Fixable'}
              </span>
              {action.confidence_score > 0 && (
                <span className="text-xs text-gray-500">{(action.confidence_score * 100).toFixed(0)}%</span>
              )}
            </div>

            {/* Test case name */}
            <p className="text-xs font-medium text-white mt-1 truncate">
              {action.test_case_name || 'Unknown test case'}
            </p>

            {/* Jira summary (if different from test name) */}
            {hasJira && action.jira_summary && (
              <p className="text-xs text-gray-500 truncate mt-0.5">
                Story: {action.jira_summary}
              </p>
            )}

            {action.suggested_fix && (
              <p className="text-xs text-gray-400 mt-1 truncate">{action.suggested_fix}</p>
            )}
          </div>

          <div className="text-xs text-gray-600 flex-shrink-0 text-right">
            {action.test_case_module && (
              <span className="block capitalize text-gray-500">{action.test_case_module}</span>
            )}
            {action.tokens_used > 0 && (
              <span className="block">{action.tokens_used} tokens</span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">

          {/* Jira story panel */}
          {hasJira && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs font-semibold text-blue-400 mb-2 flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5" /> Jira Story: {action.jira_issue_key}
                {action.jira_url && (
                  <a href={action.jira_url} target="_blank" rel="noopener noreferrer"
                    className="ml-1 text-blue-300 hover:text-blue-200 inline-flex items-center gap-0.5">
                    <ExternalLink className="w-3 h-3" /> View in Jira
                  </a>
                )}
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {action.jira_summary && <div className="col-span-2"><span className="text-gray-500">Summary: </span><span className="text-gray-200">{action.jira_summary}</span></div>}
                {action.jira_status && <div><span className="text-gray-500">Status: </span><span className="text-green-400">{action.jira_status}</span></div>}
                {action.jira_priority && <div><span className="text-gray-500">Priority: </span><span className={PRIORITY_COLORS[action.jira_priority] || 'text-gray-400'}>{action.jira_priority}</span></div>}
                {action.jira_assignee && <div className="col-span-2"><span className="text-gray-500">Assignee: </span><span className="text-gray-300">{action.jira_assignee}</span></div>}
                {action.jira_description && (
                  <div className="col-span-2 mt-1">
                    <span className="text-gray-500">AC / Description: </span>
                    <span className="text-gray-400">{action.jira_description}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Original error */}
          {action.original_error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs font-medium text-red-400 mb-1 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Original Error</p>
              <p className="text-xs text-red-300 font-mono">{action.original_error}</p>
            </div>
          )}

          {/* Suggested fix */}
          {action.suggested_fix && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
              <p className="text-xs font-medium text-purple-400 mb-1 flex items-center gap-1"><Wrench className="w-3.5 h-3.5" /> AI Healing Suggestion</p>
              <p className="text-xs text-purple-300">{action.suggested_fix}</p>
            </div>
          )}

          {/* Fix applied */}
          {action.fix_applied && (
            <div className="bg-gray-800/60 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-400 mb-1">Applied Fix</p>
              <p className="text-xs text-gray-300 italic">{action.fix_applied}</p>
            </div>
          )}

          {/* Run info */}
          {action.run_name && (
            <p className="text-xs text-gray-600 font-mono">📋 Run: {action.run_name}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function HealingPage() {
  const [actions, setActions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeForm, setAnalyzeForm] = useState({ name: '', errorMessage: '', stackTrace: '' });
  const [analysisResult, setAnalysisResult] = useState(null);
  const [error, setError] = useState(null);
  const [jiraOnly, setJiraOnly] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await healingApi.getActions({ limit: 100 });
      setActions(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!analyzeForm.errorMessage) return;
    setAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    try {
      const res = await healingApi.analyze(analyzeForm);
      setAnalysisResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const displayActions = jiraOnly ? actions.filter(a => !!a.jira_issue_key) : actions;
  const jiraLinkedCount = actions.filter(a => !!a.jira_issue_key).length;
  const totalHealed = actions.filter(a => a.success).length;
  const totalFailed = actions.filter(a => !a.success).length;
  const avgConfidence = actions.length
    ? (actions.reduce((s, a) => s + (a.confidence_score || 0), 0) / actions.length * 100).toFixed(1)
    : 0;

  if (loading) return <LoadingSpinner label="Loading healing data..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wrench className="w-6 h-6 text-purple-400" /> AI Healing Center
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Analyze failures and trigger self-healing</p>
        </div>
        <button onClick={() => load(true)} className="btn-secondary">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card text-center">
          <div className="text-3xl font-bold text-purple-400">{totalHealed}</div>
          <div className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
            <CheckCircle className="w-3 h-3 text-green-400" /> Successfully Healed
          </div>
        </div>
        <div className="stat-card text-center">
          <div className="text-3xl font-bold text-red-400">{totalFailed}</div>
          <div className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
            <XCircle className="w-3 h-3 text-red-400" /> Not Fixable
          </div>
        </div>
        <div className="stat-card text-center">
          <div className="text-3xl font-bold text-blue-400">{avgConfidence}%</div>
          <div className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
            <Brain className="w-3 h-3 text-blue-400" /> Avg AI Confidence
          </div>
        </div>
        <div className="stat-card text-center">
          <div className="text-3xl font-bold text-blue-400">{jiraLinkedCount}</div>
          <div className="text-xs text-gray-400 mt-1 flex items-center justify-center gap-1">
            <Ticket className="w-3 h-3 text-blue-400" /> Jira-Linked Cases
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Analyze Tool */}
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Brain className="w-4 h-4 text-blue-400" /> Analyze Failure with AI
          </h2>
          <form onSubmit={handleAnalyze} className="space-y-3">
            <input
              type="text"
              value={analyzeForm.name}
              onChange={(e) => setAnalyzeForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Test case name (e.g. [SCRUM-3] User Login)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <textarea
              value={analyzeForm.errorMessage}
              onChange={(e) => setAnalyzeForm(f => ({ ...f, errorMessage: e.target.value }))}
              placeholder="Error message (required) — e.g. ElementNotFound: #submit-btn"
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none font-mono"
            />
            <textarea
              value={analyzeForm.stackTrace}
              onChange={(e) => setAnalyzeForm(f => ({ ...f, stackTrace: e.target.value }))}
              placeholder="Stack trace (optional)"
              rows={3}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none resize-none font-mono"
            />
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">{error}</div>
            )}
            <button type="submit" disabled={analyzing || !analyzeForm.errorMessage} className="btn-primary w-full justify-center">
              <Zap className="w-4 h-4" />
              {analyzing ? 'Analyzing...' : 'Analyze with AI'}
            </button>
          </form>

          {analysisResult && (
            <div className="mt-4 bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <StatusBadge status={analysisResult.failureType || 'unknown'} />
                <span className="text-xs text-gray-400">Confidence: {((analysisResult.confidence || 0) * 100).toFixed(0)}%</span>
              </div>
              <p className="text-xs text-gray-300">{analysisResult.reasoning}</p>
              {analysisResult.suggestedFix && (
                <div className="bg-green-500/10 border border-green-500/20 rounded p-2">
                  <p className="text-xs font-medium text-green-400 mb-0.5">Suggested Fix</p>
                  <p className="text-xs text-green-300">{analysisResult.suggestedFix}</p>
                </div>
              )}
              <p className="text-xs text-gray-500">Can Auto-Heal: {analysisResult.canAutoHeal ? '✅ Yes' : '❌ No'}</p>
            </div>
          )}
        </div>

        {/* Recent Healing Actions */}
        <div className="glass-card overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-800 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Wrench className="w-4 h-4 text-purple-400" /> Healing Actions
              <span className="text-xs text-gray-500">({displayActions.length})</span>
            </h2>
            <button
              onClick={() => setJiraOnly(!jiraOnly)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                jiraOnly
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              title="Show only test cases linked to a Jira story"
            >
              <Ticket className="w-3.5 h-3.5" />
              Jira-linked only
              {jiraLinkedCount > 0 && (
                <span className={`px-1 rounded text-xs ${jiraOnly ? 'bg-blue-500' : 'bg-gray-700'}`}>
                  {jiraLinkedCount}
                </span>
              )}
            </button>
          </div>

          {/* Info banner when not filtering */}
          {!jiraOnly && actions.some(a => !a.jira_issue_key) && (
            <div className="px-4 py-2 bg-yellow-500/5 border-b border-yellow-500/10 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-600">
                Some entries below are from previous runs using mock templates (no Jira story). 
                New runs now generate test cases directly from your Jira stories. 
                Use <strong className="text-yellow-500">Jira-linked only</strong> to filter them out.
              </p>
            </div>
          )}

          <div className="divide-y divide-gray-800/50 overflow-y-auto flex-1 max-h-[480px]">
            {displayActions.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">
                {jiraOnly
                  ? 'No Jira-linked healing actions yet. Trigger a new test run to generate them.'
                  : 'No healing actions yet. Run tests to see AI healing in action.'}
              </div>
            ) : (
              displayActions.map((action) => (
                <HealingActionCard key={action.id} action={action} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
