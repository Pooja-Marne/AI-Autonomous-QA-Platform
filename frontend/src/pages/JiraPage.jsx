import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ticket, RefreshCw, ExternalLink, Bug, BookOpen, CheckSquare, AlertCircle, Bell, Radar, Play, XCircle, Clock, CheckCircle, Plus, PlayCircle } from 'lucide-react';
import { jiraApi, triggersApi, runsApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import CreateJiraBugModal from '../components/CreateJiraBugModal';
import JiraTriggerPrompt from '../components/JiraTriggerPrompt';
import TestCoverageModal from '../components/TestCoverageModal';
import { timeAgo } from '../utils/dateUtils';

const TYPE_ICONS = { Bug: Bug, Story: BookOpen, Task: CheckSquare };
const PRIORITY_COLORS = {
  Highest: 'text-red-500 bg-red-500/10',
  High: 'text-orange-400 bg-orange-400/10',
  Medium: 'text-yellow-400 bg-yellow-400/10',
  Low: 'text-blue-400 bg-blue-400/10',
  Lowest: 'text-gray-400 bg-gray-400/10',
};
const STATUS_COLORS = {
  Done: 'text-green-400 bg-green-400/10',
  Closed: 'text-green-400 bg-green-400/10',
  Resolved: 'text-green-400 bg-green-400/10',
  'In Progress': 'text-blue-400 bg-blue-400/10',
  'To Do': 'text-gray-400 bg-gray-400/10',
};
const FAILURE_TYPE_COLORS = {
  locator: 'text-orange-400',
  api: 'text-purple-400',
  data: 'text-yellow-400',
  environment: 'text-blue-400',
  unknown: 'text-gray-400',
};
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

export default function JiraPage() {
  const navigate = useNavigate();
  const [sprint, setSprint] = useState(null);
  const [issues, setIssues] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [failedTests, setFailedTests] = useState([]);
  const [pendingTriggers, setPendingTriggers] = useState([]);
  const [triggerHistory, setTriggerHistory] = useState([]);
  const [runStats, setRunStats] = useState(null);
  const [recentRuns, setRecentRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sprint');
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [submittingManual, setSubmittingManual] = useState(false);
  const [bugModal, setBugModal] = useState(null); // { prefill: {} }
  const [coverageModal, setCoverageModal] = useState(null); // { key, summary }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [sprintRes, bugsRes, failedRes, pendingRes, historyRes, statsRes] = await Promise.allSettled([
        jiraApi.getSprint(),
        jiraApi.getBugs(),
        jiraApi.getFailedTests(),
        triggersApi.getPending(),
        triggersApi.getHistory({ limit: 50 }),
        runsApi.getStats(),
      ]);
      if (sprintRes.status === 'fulfilled') {
        setSprint(sprintRes.value?.data?.sprint);
        setIssues(sprintRes.value?.data?.issues || []);
      }
      if (bugsRes.status === 'fulfilled') setBugs(bugsRes.value?.data || []);
      if (failedRes.status === 'fulfilled') setFailedTests(failedRes.value?.data || []);
      if (pendingRes.status === 'fulfilled') setPendingTriggers(pendingRes.value?.data || []);
      if (historyRes.status === 'fulfilled') setTriggerHistory(historyRes.value?.data || []);
      if (statsRes.status === 'fulfilled') {
        setRunStats(statsRes.value?.data?.overall || null);
        setRecentRuns(statsRes.value?.data?.recentRuns || []);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openBugModalForIssue = (issue) => {
    setBugModal({
      prefill: {
        summary: `[${issue.key}] Bug: ${issue.summary}`,
        description: `Issue: ${issue.key}\nSummary: ${issue.summary}\nStatus: ${issue.status}\nType: ${issue.type}\nAssignee: ${issue.assignee || 'Unassigned'}\nJira URL: ${issue.url || ''}`,
        issueType: 'Bug',
        priority: issue.priority || 'High',
      },
    });
  };

  const openBugModalForFailedTest = (tc) => {
    setBugModal({
      prefill: {
        summary: `[Test Failure] ${tc.module?.toUpperCase()} - ${tc.name}`,
        description: `Test Case: ${tc.name}\nModule: ${tc.module}\nStatus: ${tc.status}\nFailure Type: ${tc.failure_type || 'unknown'}\nError: ${tc.error_message || 'No error message'}\n\nRun: ${tc.run_name || tc.run_id}\nSuite: ${tc.run_suite || 'N/A'}`,
        issueType: 'Bug',
        priority: tc.status === 'not_fixable' ? 'High' : 'Medium',
      },
    });
  };

  const handlePollNow = async () => {
    setPolling(true);
    try {
      await triggersApi.pollNow();
      await load(true);
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
      setActiveTab('triggers');
    } finally {
      setSubmittingManual(false);
    }
  };

  const handleDecision = useCallback((triggerId, result) => {
    setPendingTriggers((prev) => prev.filter((t) => t.id !== triggerId));
    load(true);
    if (result.action === 'run_started' && result.runId) {
      setTimeout(() => navigate(`/runs/${result.runId}`), 400);
    }
  }, [load, navigate]);

  const displayData = activeTab === 'sprint' ? issues : bugs;
  const doneCount = issues.filter((i) => ['done', 'closed', 'resolved'].includes(i.status?.toLowerCase())).length;

  if (loading) return <LoadingSpinner label="Connecting to Jira..." />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Ticket className="w-6 h-6 text-blue-400" /> Jira
          </h1>
          {sprint ? (
            <p className="text-sm text-gray-400 mt-0.5">
              Active Sprint: <span className="text-blue-400 font-medium">{sprint}</span>
              <span className="text-gray-600"> · {issues.length} issues, {doneCount} done</span>
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-0.5">No active sprint found</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setBugModal({ prefill: { issueType: 'Bug', priority: 'High', summary: '', description: '' } })}
            className="btn-primary"
          >
            <Bug className="w-4 h-4" />
            Create Bug
          </button>
          <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'sprint', label: `Sprint Issues (${issues.length})` },
          { key: 'bugs', label: `Bugs (${bugs.length})` },
          { key: 'failed', label: `Failed Tests (${failedTests.length})`, badge: failedTests.length > 0 },
          { key: 'triggers', label: `Triggers (${pendingTriggers.length})`, badge: pendingTriggers.length > 0 },
          { key: 'execution', label: 'Test Execution Status' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {tab.label}
            {tab.badge && activeTab !== tab.key && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Failed Tests Tab */}
      {activeTab === 'failed' && (
        <div className="glass-card overflow-hidden">
          {failedTests.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No failed test cases found in recent runs.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Test Case</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Module</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Failure Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Run</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {failedTests.map((tc) => (
                  <tr key={tc.id} className="table-row border-b border-gray-800/50 last:border-0">
                    <td className="px-5 py-3.5 max-w-xs">
                      <p className="text-sm text-white truncate">{tc.name}</p>
                      {tc.error_message && (
                        <p className="text-xs text-red-400 truncate mt-0.5 max-w-[280px]">{tc.error_message}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-gray-300 capitalize">{tc.module || '—'}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`text-xs font-medium capitalize ${FAILURE_TYPE_COLORS[tc.failure_type] || 'text-gray-400'}`}>
                        {tc.failure_type || 'unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        tc.status === 'not_fixable'
                          ? 'text-red-400 bg-red-400/10'
                          : 'text-orange-400 bg-orange-400/10'
                      }`}>
                        {tc.status === 'not_fixable' ? '⚠ Not Fixable' : '✗ Failed'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs text-gray-500 truncate max-w-[120px] block">{tc.run_name || tc.run_id?.slice(0, 8) + '…'}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        onClick={() => openBugModalForFailedTest(tc)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        <Bug className="w-3.5 h-3.5" />
                        Create Jira Bug
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Triggers Tab */}
      {activeTab === 'triggers' && (
        <div className="space-y-5">
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

          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                Manually create a trigger for any Jira issue key
              </p>
              <button onClick={handlePollNow} disabled={polling} className="btn-secondary py-1.5">
                <Radar className={`w-3.5 h-3.5 ${polling ? 'animate-spin' : ''}`} />
                {polling ? 'Polling...' : 'Poll Jira Now'}
              </button>
            </div>
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
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Pending Decision ({pendingTriggers.length})</p>
            {pendingTriggers.length === 0 ? (
              <div className="glass-card p-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-500/30 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">No pending decisions</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingTriggers.map((trigger) => (
                  <JiraTriggerPrompt key={trigger.id} triggers={[trigger]} onDecision={handleDecision} inline />
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">All History ({triggerHistory.length})</p>
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
                  {triggerHistory.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-10 text-gray-500 text-sm">No trigger history yet</td></tr>
                  ) : (
                    triggerHistory.map((t) => {
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
                              <button onClick={() => navigate(`/runs/${t.run_id}`)} className="text-xs text-blue-400 hover:text-blue-300 font-mono transition-colors">
                                {t.run_id.substring(0, 8)}...
                              </button>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-gray-400">{timeAgo(t.created_at)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Test Execution Status Tab */}
      {activeTab === 'execution' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="stat-card text-center">
              <div className="text-3xl font-bold text-blue-400">{runStats?.total_runs || 0}</div>
              <div className="text-xs text-gray-400 mt-1">Total Runs</div>
            </div>
            <div className="stat-card text-center">
              <div className="text-3xl font-bold text-green-400">{runStats?.total_passed || 0}</div>
              <div className="text-xs text-gray-400 mt-1">Passed</div>
            </div>
            <div className="stat-card text-center">
              <div className="text-3xl font-bold text-red-400">{runStats?.total_failed || 0}</div>
              <div className="text-xs text-gray-400 mt-1">Failed</div>
            </div>
            <div className="stat-card text-center">
              <div className="text-3xl font-bold text-purple-400">{runStats?.total_healed || 0}</div>
              <div className="text-xs text-gray-400 mt-1">Fixed</div>
            </div>
          </div>

          <div className="glass-card overflow-hidden">
            <div className="p-4 border-b border-gray-800">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <PlayCircle className="w-4 h-4 text-blue-400" /> Recent Runs
              </h2>
            </div>
            {recentRuns.length === 0 ? (
              <div className="p-8 text-center text-gray-500 text-sm">No test runs yet.</div>
            ) : (
              <div className="divide-y divide-gray-800/50">
                {recentRuns.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => navigate(`/runs/${run.id}`)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-800/30 transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate">{run.name}</p>
                      <p className="text-xs text-gray-500">{timeAgo(run.created_at)}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StatusBadge status={run.status} />
                      <span className="text-xs text-gray-400">{run.passed}/{run.total_tests}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sprint / Bugs Tab */}
      {(activeTab === 'sprint' || activeTab === 'bugs') && (
        <div className="glass-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Key</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Summary</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Priority</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Assignee</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-gray-500">
                    <Ticket className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No issues found.</p>
                  </td>
                </tr>
              ) : (
                displayData.map((issue) => {
                  const TypeIcon = TYPE_ICONS[issue.type] || Ticket;
                  const isDone = ['done', 'closed', 'resolved'].includes(issue.status?.toLowerCase());
                  return (
                    <tr key={issue.key || issue.id} className="table-row border-b border-gray-800/50 last:border-0">
                      <td className="px-5 py-3.5">
                        <span className="text-sm font-mono text-blue-400">{issue.key}</span>
                      </td>
                      <td className="px-4 py-3.5 max-w-xs">
                        <p className={`text-sm truncate ${isDone ? 'text-gray-500 line-through' : 'text-white'}`}>
                          {issue.summary}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <TypeIcon className="w-3.5 h-3.5" /> {issue.type}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[issue.status] || 'text-gray-300 bg-gray-700'}`}>
                          {issue.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLORS[issue.priority] || 'text-gray-400'}`}>
                          {issue.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-gray-400">{issue.assignee || 'Unassigned'}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-2">
                          {isDone && (
                            <button
                              onClick={() => setCoverageModal({ key: issue.key, summary: issue.summary })}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-600/80 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors"
                              title="Analyze test coverage for this issue"
                            >
                              <Radar className="w-3 h-3" />
                              Coverage
                            </button>
                          )}
                          <button
                            onClick={() => openBugModalForIssue(issue)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-600/80 hover:bg-red-600 text-white text-xs rounded-lg transition-colors"
                            title="Create a Jira bug linked to this issue"
                          >
                            <Bug className="w-3 h-3" />
                            Bug
                          </button>
                          {issue.url && (
                            <a href={issue.url} target="_blank" rel="noopener noreferrer"
                              className="text-gray-500 hover:text-blue-400 transition-colors">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Bug Modal */}
      {bugModal && (
        <CreateJiraBugModal
          prefill={bugModal.prefill}
          onClose={() => setBugModal(null)}
          onCreated={(issue) => {
            setBugModal(null);
            load(true); // refresh to show new bug
          }}
        />
      )}

      {/* Test Coverage Modal */}
      {coverageModal && (
        <TestCoverageModal
          jiraKey={coverageModal.key}
          jiraSummary={coverageModal.summary}
          onClose={() => setCoverageModal(null)}
        />
      )}
    </div>
  );
}
