import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, ChevronDown, ChevronRight, ExternalLink, Wrench, XCircle, CheckCircle, AlertCircle, Clock, GitCommit, Ticket } from 'lucide-react';
import { runsApi, reportsApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import { timeAgo, fullDateTime, formatDuration } from '../utils/dateUtils';

function TestCaseRow({ tc }) {
  const [expanded, setExpanded] = useState(false);
  const healing = tc.healing_suggestion ? (() => { try { return JSON.parse(tc.healing_suggestion); } catch { return null; } })() : null;
  const jiraUrl = tc.jira_url || null;

  return (
    <>
      <tr className="table-row cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
            <div className="min-w-0">
              <span className="text-sm text-white block truncate max-w-xs">{tc.name}</span>
              {tc.jira_summary && tc.jira_summary !== tc.name && (
                <span className="text-xs text-gray-500 truncate block max-w-xs">{tc.jira_summary}</span>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-400 capitalize">{tc.module}</td>
        <td className="px-4 py-3"><StatusBadge status={tc.status} /></td>
        <td className="px-4 py-3">{tc.failure_type && <StatusBadge status={tc.failure_type} />}</td>
        <td className="px-4 py-3">{tc.healing_status && tc.healing_status !== 'null' && <StatusBadge status={tc.healing_status} />}</td>
        <td className="px-4 py-3">
          {tc.jira_issue_key && (
            <a
              href={jiraUrl || '#'}
              target={jiraUrl ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 font-mono hover:text-blue-300 hover:underline transition-colors"
              onClick={e => e.stopPropagation()}
              title={tc.jira_summary || tc.jira_issue_key}
            >
              <Ticket className="w-3 h-3" />
              {tc.jira_issue_key}
              {jiraUrl && <ExternalLink className="w-2.5 h-2.5 opacity-60" />}
            </a>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">{formatDuration(tc.duration_ms)}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-900/50">
          <td colSpan={7} className="px-6 py-4">
            <div className="space-y-3">

              {/* Jira Story context panel */}
              {tc.jira_issue_key && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-xs font-medium text-blue-400 mb-2 flex items-center gap-1.5">
                    <Ticket className="w-3.5 h-3.5" /> Jira Story: {tc.jira_issue_key}
                    {jiraUrl && (
                      <a href={jiraUrl} target="_blank" rel="noopener noreferrer"
                        className="ml-1 text-blue-300 hover:text-blue-200 inline-flex items-center gap-0.5"
                        onClick={e => e.stopPropagation()}>
                        <ExternalLink className="w-3 h-3" /> View
                      </a>
                    )}
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    {tc.jira_summary && <div className="col-span-2"><span className="text-gray-500">Summary: </span><span className="text-gray-200">{tc.jira_summary}</span></div>}
                    {tc.jira_status && <div><span className="text-gray-500">Status: </span><span className="text-green-400">{tc.jira_status}</span></div>}
                    {tc.jira_priority && <div><span className="text-gray-500">Priority: </span><span className="text-yellow-400">{tc.jira_priority}</span></div>}
                    {tc.jira_assignee && <div><span className="text-gray-500">Assignee: </span><span className="text-gray-300">{tc.jira_assignee}</span></div>}
                    {tc.jira_description && (
                      <div className="col-span-2 mt-1">
                        <span className="text-gray-500">AC / Description: </span>
                        <span className="text-gray-400">{tc.jira_description}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tc.error_message && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-xs font-medium text-red-400 mb-1 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Error Message</p>
                  <p className="text-xs text-red-300 font-mono">{tc.error_message}</p>
                </div>
              )}
              {tc.stack_trace && (
                <div className="bg-gray-800/60 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-400 mb-1">Stack Trace</p>
                  <pre className="text-xs text-gray-400 font-mono overflow-x-auto whitespace-pre-wrap">{tc.stack_trace}</pre>
                </div>
              )}
              {tc.healing_action && (
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                  <p className="text-xs font-medium text-purple-400 mb-1 flex items-center gap-1"><Wrench className="w-3.5 h-3.5" /> AI Healing Action</p>
                  <p className="text-xs text-purple-300">{tc.healing_action}</p>
                  {healing?.jiraAlignment && (
                    <p className="text-xs text-blue-300 mt-1.5 italic">
                      <span className="text-blue-400 not-italic font-medium">Jira Alignment: </span>{healing.jiraAlignment}
                    </p>
                  )}
                  {healing?.steps?.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {healing.steps.map((s, i) => (
                        <li key={i} className="text-xs text-gray-400 flex items-start gap-1">
                          <span className="text-purple-500 font-mono">{i + 1}.</span> {s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {tc.original_selector && (
                <div className="flex gap-3">
                  <div className="flex-1 bg-gray-800/60 rounded-lg p-2">
                    <p className="text-xs text-gray-500 mb-0.5">Original Selector</p>
                    <code className="text-xs text-red-400">{tc.original_selector}</code>
                  </div>
                  {tc.healed_selector && tc.healed_selector !== tc.original_selector && (
                    <div className="flex-1 bg-gray-800/60 rounded-lg p-2">
                      <p className="text-xs text-gray-500 mb-0.5">Healed Selector</p>
                      <code className="text-xs text-green-400">{tc.healed_selector}</code>
                    </div>
                  )}
                </div>
              )}
              {tc.file_path && <p className="text-xs text-gray-500 font-mono">📄 {tc.file_path}</p>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function RunDetails() {
  const { id } = useParams();
  const [run, setRun] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [moduleFilter, setModuleFilter] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [runRes, reportRes] = await Promise.allSettled([runsApi.getById(id), reportsApi.getByRunId(id)]);
      if (runRes.status === 'fulfilled') setRun(runRes.value?.data);
      if (reportRes.status === 'fulfilled') setReport(reportRes.value?.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (run?.status === 'running' || run?.status === 'healing') {
      const i = setInterval(() => load(true), 15000);
      return () => clearInterval(i);
    }
  }, [run?.status, load]);

  if (loading) return <LoadingSpinner label="Loading run details..." />;
  if (!run) return <div className="text-center text-gray-400 py-20">Run not found</div>;

  const testCases = run.testCases || [];
  const modules = [...new Set(testCases.map(tc => tc.module).filter(Boolean))];
  const tabs = [
    { key: 'all', label: 'All Tests', count: testCases.length },
    { key: 'passed', label: 'Passed', count: testCases.filter(t => t.status === 'passed').length },
    { key: 'failed', label: 'Failed', count: testCases.filter(t => t.status === 'failed').length },
    { key: 'healed', label: 'Healed', count: testCases.filter(t => t.status === 'healed').length },
    { key: 'not_fixable', label: 'Not Fixable', count: testCases.filter(t => t.healing_status === 'not_fixable').length },
  ];

  const filteredCases = testCases.filter(tc => {
    const tabMatch = activeTab === 'all' || (activeTab === 'not_fixable' ? tc.healing_status === 'not_fixable' : tc.status === activeTab);
    const moduleMatch = !moduleFilter || tc.module === moduleFilter;
    return tabMatch && moduleMatch;
  });

  const passRate = run.total_tests ? ((run.passed / run.total_tests) * 100).toFixed(1) : 0;
  const healingRate = (run.healed + run.failed + run.not_fixable) > 0 ? ((run.healed / (run.healed + run.failed + (run.not_fixable || 0))) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Link to="/runs" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{run.name}</h1>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <StatusBadge status={run.status} />
            {run.branch && <span className="text-xs text-gray-500 font-mono flex items-center gap-1"><GitCommit className="w-3 h-3" />{run.branch}</span>}
            {run.commit_sha && <span className="text-xs text-gray-500 font-mono">{run.commit_sha}</span>}
            {run.jira_sprint && <span className="text-xs text-gray-500 flex items-center gap-1"><Ticket className="w-3 h-3" />{run.jira_sprint}</span>}
            {run.started_at && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Started: <span className="text-gray-400">{fullDateTime(run.started_at)}</span>
              </span>
            )}
            {run.completed_at && (
              <span className="text-xs text-gray-500">
                Completed: <span className="text-gray-400">{fullDateTime(run.completed_at)}</span>
              </span>
            )}
          </div>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: run.total_tests, color: 'text-white' },
          { label: 'Passed', value: run.passed, color: 'text-green-400' },
          { label: 'Failed', value: run.failed, color: 'text-red-400' },
          { label: 'Healed', value: run.healed, color: 'text-purple-400' },
          { label: 'Not Fixable', value: run.not_fixable || 0, color: 'text-orange-400' },
        ].map((m) => (
          <div key={m.label} className="glass-card p-4 text-center">
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <p className="text-xs text-gray-400 mt-1">{m.label}</p>
          </div>
        ))}
      </div>

      {/* Progress Bars */}
      <div className="glass-card p-5">
        <div className="flex justify-between text-xs text-gray-400 mb-2">
          <span>Pass Rate: <span className="text-green-400 font-medium">{passRate}%</span></span>
          <span>AI Healing Rate: <span className="text-purple-400 font-medium">{healingRate}%</span></span>
          {run.duration_ms && <span>Duration: {formatDuration(run.duration_ms)}</span>}
        </div>
        <div className="flex rounded-full overflow-hidden h-3 bg-gray-800">
          <div className="bg-green-500 transition-all" style={{ width: `${run.total_tests ? (run.passed / run.total_tests) * 100 : 0}%` }} />
          <div className="bg-purple-500 transition-all" style={{ width: `${run.total_tests ? (run.healed / run.total_tests) * 100 : 0}%` }} />
          <div className="bg-red-500 transition-all" style={{ width: `${run.total_tests ? (run.failed / run.total_tests) * 100 : 0}%` }} />
          <div className="bg-orange-500 transition-all" style={{ width: `${run.total_tests ? ((run.not_fixable || 0) / run.total_tests) * 100 : 0}%` }} />
        </div>
        <div className="flex gap-4 text-xs text-gray-500 mt-2">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Passed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />Healed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Failed</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />Not Fixable</span>
        </div>
      </div>

      {/* Report Summary */}
      {report?.summary && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-white mb-2">AI Report Summary</h3>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans">{report.summary}</pre>
          {report.rootCauseAnalysis && (
            <div className="mt-3 pt-3 border-t border-gray-800">
              <h4 className="text-xs font-semibold text-gray-400 mb-1">Root Cause Analysis</h4>
              <pre className="text-xs text-gray-400 whitespace-pre-wrap font-sans">{report.rootCauseAnalysis}</pre>
            </div>
          )}
        </div>
      )}

      {/* Test Cases Table */}
      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-wrap gap-3">
          <div className="flex gap-1 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                {tab.label} <span className="opacity-70">({tab.count})</span>
              </button>
            ))}
          </div>
          {modules.length > 0 && (
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Modules</option>
              {modules.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Test Case</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Module</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Failure Type</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Healing</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Jira</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Duration</th>
            </tr>
          </thead>
          <tbody>
            {filteredCases.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-500 text-sm">No test cases match the filter</td></tr>
            ) : (
              filteredCases.map(tc => <TestCaseRow key={tc.id} tc={tc} />)
            )}
          </tbody>
        </table>
      </div>

      {/* Healing Actions */}
      {run.healingActions?.length > 0 && (
        <div className="glass-card">
          <div className="p-4 border-b border-gray-800">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Wrench className="w-4 h-4 text-purple-400" /> AI Healing Actions ({run.healingActions.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-800/50">
            {run.healingActions.map((action) => {
              const aiAnalysis = action.ai_analysis ? JSON.parse(action.ai_analysis) : null;
              return (
                <div key={action.id} className="px-5 py-3.5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={action.failure_type || 'unknown'} />
                        <span className={`text-xs font-medium ${action.success ? 'text-green-400' : 'text-red-400'}`}>
                          {action.success ? '✓ Healed' : '✗ Not Fixable'}
                        </span>
                        {action.confidence_score > 0 && (
                          <span className="text-xs text-gray-500">Confidence: {(action.confidence_score * 100).toFixed(0)}%</span>
                        )}
                      </div>
                      {action.suggested_fix && <p className="text-xs text-gray-300">{action.suggested_fix}</p>}
                      {action.fix_applied && <p className="text-xs text-gray-500 mt-0.5 italic">{action.fix_applied}</p>}
                    </div>
                    {action.tokens_used > 0 && (
                      <span className="text-xs text-gray-600 ml-3">{action.tokens_used} tokens</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
