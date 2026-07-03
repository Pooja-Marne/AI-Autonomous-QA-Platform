import { useState, useEffect } from 'react';
import { Ticket, RefreshCw, ExternalLink, Bug, BookOpen, CheckSquare, Plus, AlertCircle, Wrench } from 'lucide-react';
import { jiraApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import CreateJiraBugModal from '../components/CreateJiraBugModal';

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

export default function JiraPage() {
  const [sprint, setSprint] = useState(null);
  const [issues, setIssues] = useState([]);
  const [bugs, setBugs] = useState([]);
  const [failedTests, setFailedTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sprint');
  const [refreshing, setRefreshing] = useState(false);
  const [bugModal, setBugModal] = useState(null); // { prefill: {} }

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [sprintRes, bugsRes, failedRes] = await Promise.allSettled([
        jiraApi.getSprint(),
        jiraApi.getBugs(),
        jiraApi.getFailedTests(),
      ]);
      if (sprintRes.status === 'fulfilled') {
        setSprint(sprintRes.value?.data?.sprint);
        setIssues(sprintRes.value?.data?.issues || []);
      }
      if (bugsRes.status === 'fulfilled') setBugs(bugsRes.value?.data || []);
      if (failedRes.status === 'fulfilled') setFailedTests(failedRes.value?.data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  const displayData = activeTab === 'sprint' ? issues : bugs;

  if (loading) return <LoadingSpinner label="Connecting to Jira..." />;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Ticket className="w-6 h-6 text-blue-400" /> Jira Integration
          </h1>
          {sprint && <p className="text-sm text-gray-400 mt-0.5">Active Sprint: <span className="text-blue-400 font-medium">{sprint}</span></p>}
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
      <div className="flex gap-2">
        {[
          { key: 'sprint', label: `Sprint Issues (${issues.length})` },
          { key: 'bugs', label: `Bugs (${bugs.length})` },
          {
            key: 'failed',
            label: `Failed Tests (${failedTests.length})`,
            badge: failedTests.length > 0,
          },
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
      {activeTab === 'failed' ? (
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
      ) : (
        /* Sprint / Bugs Tab */
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
    </div>
  );
}
