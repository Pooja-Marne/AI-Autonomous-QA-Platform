import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, XCircle, Wrench, AlertTriangle, Play, RefreshCw, Ticket, TrendingUp, Activity, Clock, ExternalLink, Bug, BookOpen, CheckSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { runsApi, jiraApi } from '../services/api';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import TriggerRunModal from '../components/TriggerRunModal';
import { timeAgo, shortDate } from '../utils/dateUtils';

const TYPE_ICONS = { Bug, Story: BookOpen, Task: CheckSquare };
const PRIORITY_DOTS = { Highest: 'bg-red-500', High: 'bg-orange-400', Medium: 'bg-yellow-400', Low: 'bg-blue-400', Lowest: 'bg-gray-400' };

function ClosedIssueCard({ issue }) {
  const [expanded, setExpanded] = useState(false);
  const TypeIcon = TYPE_ICONS[issue.issue_type || issue.type] || Ticket;
  const dot = PRIORITY_DOTS[issue.priority] || 'bg-gray-400';
  const resolvedDate = shortDate(issue.fetched_at);

  return (
    <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl overflow-hidden">
      {/* Top row */}
      <div className="flex items-start gap-3 p-3">
        <div className="flex-shrink-0 w-7 h-7 rounded-md bg-green-500/20 flex items-center justify-center mt-0.5">
          <CheckCircle className="w-4 h-4 text-green-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-blue-400 flex-shrink-0">{issue.jira_key || issue.key}</span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <TypeIcon className="w-3 h-3" /> {issue.issue_type || issue.type}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              {issue.priority}
            </span>
            <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium">
              {issue.status}
            </span>
          </div>
          <p className="text-sm text-gray-300 mt-0.5 truncate">{issue.summary}</p>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-gray-600 hover:text-gray-400 flex-shrink-0 mt-0.5 transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded metadata */}
      {expanded && (
        <div className="border-t border-gray-700/50 px-3 pb-3 pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div className="flex gap-1.5">
              <span className="text-gray-500 flex-shrink-0">Assignee:</span>
              <span className="text-gray-300 truncate">{issue.assignee || 'Unassigned'}</span>
            </div>
            {resolvedDate && (
              <div className="flex gap-1.5">
                <span className="text-gray-500 flex-shrink-0">Synced:</span>
                <span className="text-gray-300">{resolvedDate}</span>
              </div>
            )}
            {issue.sprint && (
              <div className="flex gap-1.5 col-span-2">
                <span className="text-gray-500 flex-shrink-0">Sprint:</span>
                <span className="text-gray-300 truncate">{issue.sprint}</span>
              </div>
            )}
            {issue.description && (
              <div className="col-span-2 flex gap-1.5">
                <span className="text-gray-500 flex-shrink-0">Description:</span>
                <span className="text-gray-400 text-xs line-clamp-2">{issue.description}</span>
              </div>
            )}
          </div>
          {(issue.url || issue.jira_url) && (
            <a
              href={issue.url || issue.jira_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              View in Jira
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [runs, setRuns] = useState([]);
  const [jiraData, setJiraData] = useState(null);
  const [closedIssues, setClosedIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [statsRes, runsRes, jiraRes, closedRes] = await Promise.allSettled([
        runsApi.getStats(),
        runsApi.getAll({ limit: 8 }),
        jiraApi.getCached(),
        jiraApi.getClosed(),
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value?.data);
      if (runsRes.status === 'fulfilled') setRuns(runsRes.value?.runs || []);
      if (jiraRes.status === 'fulfilled') setJiraData(jiraRes.value?.data || []);
      if (closedRes.status === 'fulfilled') setClosedIssues(closedRes.value?.data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(true), 60000);
    return () => clearInterval(interval);
  }, [load]);

  const overall = stats?.overall || {};
  const passRate = overall.avg_pass_rate ? Number(overall.avg_pass_rate).toFixed(1) : '—';
  const healingRate = overall.avg_healing_rate ? Number(overall.avg_healing_rate).toFixed(1) : '—';

  if (loading) return <LoadingSpinner label="Loading dashboard..." />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">AI QA Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Autonomous testing with AI self-healing</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Play className="w-4 h-4" />
            Run Tests
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Runs" value={overall.total_runs || 0} icon={Activity} color="blue" sub="All time" />
        <StatCard label="Pass Rate" value={`${passRate}%`} icon={CheckCircle} color="green" sub="Average across runs" />
        <StatCard label="AI Healed" value={overall.total_healed || 0} icon={Wrench} color="purple" sub={`Healing rate: ${healingRate}%`} />
        <StatCard label="Not Fixable" value={overall.total_not_fixable || 0} icon={AlertTriangle} color="red" sub="Require manual fix" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Tests Passed" value={overall.total_passed || 0} icon={CheckCircle} color="green" />
        <StatCard label="Tests Failed" value={overall.total_failed || 0} icon={XCircle} color="red" />
        <StatCard label="Total Test Cases" value={overall.total_test_cases || 0} icon={TrendingUp} color="blue" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Runs */}
        <div className="xl:col-span-2 glass-card">
          <div className="flex items-center justify-between p-5 border-b border-gray-800">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Play className="w-4 h-4 text-blue-400" /> Recent Test Runs
            </h2>
            <Link to="/runs" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View all →</Link>
          </div>
          <div className="divide-y divide-gray-800/50">
            {runs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Play className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No test runs yet. Click "Run Tests" to start.</p>
              </div>
            ) : (
              runs.map((run) => (
                <Link key={run.id} to={`/runs/${run.id}`} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-800/30 transition-colors block">
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusBadge status={run.status} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{run.name}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        {timeAgo(run.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400 flex-shrink-0">
                    <span className="text-green-400">✓ {run.passed}</span>
                    <span className="text-red-400">✗ {run.failed}</span>
                    <span className="text-purple-400">⚡ {run.healed}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Sidebar widgets */}
        <div className="space-y-4">
          {/* Jira Widget */}
          <div className="glass-card">
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Ticket className="w-4 h-4 text-blue-400" /> Jira Issues
              </h3>
              <Link to="/jira" className="text-xs text-blue-400 hover:text-blue-300">View all →</Link>
            </div>
            <div className="p-3 space-y-2 max-h-52 overflow-y-auto">
              {(!jiraData || jiraData.length === 0) ? (
                <p className="text-xs text-gray-500 text-center py-4">No cached Jira issues</p>
              ) : (
                jiraData.slice(0, 6).map((issue) => (
                  <div key={issue.id || issue.key} className="flex items-start gap-2 p-2 rounded-lg bg-gray-800/40">
                    <span className="text-xs font-mono text-blue-400 flex-shrink-0">{issue.key}</span>
                    <p className="text-xs text-gray-300 truncate">{issue.summary}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Closed Jira Issues Widget */}
          {closedIssues.length > 0 && (
            <div className="glass-card">
              <div className="flex items-center justify-between p-4 border-b border-gray-800">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  Closed / Done Issues
                  <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-medium">{closedIssues.length}</span>
                </h3>
                <Link to="/jira" className="text-xs text-blue-400 hover:text-blue-300">View all →</Link>
              </div>
              <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
                {closedIssues.slice(0, 8).map((issue) => (
                  <ClosedIssueCard key={issue.id || issue.jira_key || issue.key} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {/* Module Stability */}
          {stats?.failuresByModule?.length > 0 && (
            <div className="glass-card">
              <div className="p-4 border-b border-gray-800">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-400" /> Unstable Modules
                </h3>
              </div>
              <div className="p-3 space-y-2">
                {stats.failuresByModule.slice(0, 5).map((m) => (
                  <div key={m.module} className="flex items-center justify-between">
                    <span className="text-xs text-gray-300 capitalize">{m.module}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, (m.failures / Math.max(...stats.failuresByModule.map(x => x.failures), 1)) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-red-400">{m.failures}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <TriggerRunModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); setTimeout(() => load(true), 2000); }}
        />
      )}
    </div>
  );
}
