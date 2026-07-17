import { useEffect, useState } from 'react';
import { Database, CheckCircle2, XCircle, GitPullRequest, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { locatorsApi } from '../../services/api';
import StatusBadge from '../StatusBadge';
import LocatorLifecycleStepper from './LocatorLifecycleStepper';

const GIT_STATUS_LABEL = {
  not_started: 'Not started',
  pr_open: 'PR Open',
  pr_merged: 'Merged',
  pr_closed_unmerged: 'Closed (not merged)',
  failed: 'Failed',
};

// A locator can accumulate dozens of versions from repeated demo/chaos
// cycles — many of them re-affirming the exact same value. Showing every
// raw row buries the actual story (which distinct values were tried, and
// how each one ended up) in noise. Collapses consecutive versions sharing
// the same healed_locator into one summary row instead; full per-version
// detail is still available, just not the default view.
function groupHistory(history) {
  const groups = [];
  for (const h of history) {
    const last = groups[groups.length - 1];
    if (last && last.value === h.healed_locator) {
      last.count += 1;
      last.minVersion = h.version; // history is version DESC, so this only shrinks
    } else {
      groups.push({
        value: h.healed_locator, status: h.status,
        maxVersion: h.version, minVersion: h.version,
        count: 1, latestDate: h.created_at,
      });
    }
  }
  return groups;
}

const HISTORY_GROUPS_COLLAPSED = 5;

function LocatorCard({ locator, onApprove, onReject, busy }) {
  const [showAllHistory, setShowAllHistory] = useState(false);
  return (
    <div className="glass-card border border-purple-500/10 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-gray-800/60">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
              {locator.page_object}.{locator.property_name}
            </span>
            <StatusBadge status={locator.status} />
            <span className="text-xs text-gray-500">v{locator.version}</span>
          </div>
        </div>
        <span className="text-xs text-gray-500 flex items-center gap-1 flex-shrink-0">
          <Clock className="w-3 h-3" /> {new Date(locator.created_at).toLocaleDateString()}
        </span>
      </div>

      <div className="px-4 pt-3">
        <LocatorLifecycleStepper locator={locator} />
      </div>

      <div className="px-4 pb-4 space-y-3 pt-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 bg-gray-900/60 border border-gray-800 rounded-lg p-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Original Locator</p>
            <code className="text-xs text-red-400 break-all">{locator.original_locator}</code>
          </div>
          <span className="text-gray-600 hidden sm:block">→</span>
          <div>
            <p className="text-xs text-gray-500 mb-1">Current Locator</p>
            <code className="text-xs text-green-400 break-all">{locator.healed_locator}</code>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-800/40 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">Confidence</p>
            <p className="text-lg font-bold text-blue-400">{locator.confidence_score ?? '—'}%</p>
          </div>
          <div className="bg-gray-800/40 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">Healed On</p>
            <p className="text-sm font-semibold text-gray-300">{new Date(locator.created_at).toLocaleDateString()}</p>
          </div>
          <div className="bg-gray-800/40 rounded-lg p-2.5">
            <p className="text-xs text-gray-500">Git Status</p>
            <p className={clsx('text-sm font-semibold', locator.git_status === 'pr_open' ? 'text-blue-400' : locator.git_status === 'pr_merged' ? 'text-emerald-400' : locator.git_status === 'failed' || locator.git_status === 'pr_closed_unmerged' ? 'text-red-400' : 'text-gray-400')}>
              {GIT_STATUS_LABEL[locator.git_status] || locator.git_status}
            </p>
          </div>
        </div>

        {locator.healing_reason && (
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
            <p className="text-xs font-medium text-purple-400 mb-1">Healing Reason</p>
            <p className="text-xs text-purple-200">{locator.healing_reason}</p>
          </div>
        )}

        {locator.status === 'resolved' && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
            <p className="text-xs font-medium text-emerald-400 mb-1">
              Resolved{locator.resolved_at ? ` — ${new Date(locator.resolved_at).toLocaleString()}` : ''}
            </p>
            <p className="text-xs text-emerald-200">
              Confirmed active in current source{locator.resolution_reason ? ` (${locator.resolution_reason})` : ''}.
            </p>
          </div>
        )}

        {locator.git_pr_url && (
          <a href={locator.git_pr_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-blue-400 px-2.5 py-1.5 rounded-lg transition-colors">
            <GitPullRequest className="w-3.5 h-3.5" /> View Pull Request
          </a>
        )}

        {locator.history?.length > 1 && (() => {
          const groups = groupHistory(locator.history);
          const visibleGroups = showAllHistory ? groups : groups.slice(0, HISTORY_GROUPS_COLLAPSED);
          const hiddenCount = groups.length - visibleGroups.length;
          return (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">
                Version History
                <span className="normal-case text-gray-600"> — {locator.history.length} versions, {groups.length} distinct value{groups.length === 1 ? '' : 's'} tried</span>
              </p>
              <div className="space-y-1">
                {visibleGroups.map((g) => (
                  <div key={`${g.value}-${g.maxVersion}`} className="text-xs text-gray-500 flex items-center gap-2">
                    <span className="font-mono text-gray-600 flex-shrink-0">
                      {g.count > 1 ? `v${g.minVersion}–v${g.maxVersion}` : `v${g.maxVersion}`}
                    </span>
                    <code className="text-gray-400 truncate">{g.value}</code>
                    {g.count > 1 && <span className="text-gray-600 flex-shrink-0">×{g.count}</span>}
                    <StatusBadge status={g.status} className="flex-shrink-0" />
                    <span className="text-gray-600 flex-shrink-0 ml-auto">{new Date(g.latestDate).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
              {hiddenCount > 0 && (
                <button onClick={() => setShowAllHistory(true)} className="text-xs text-blue-400 hover:underline mt-1.5">
                  Show {hiddenCount} more
                </button>
              )}
              {showAllHistory && groups.length > HISTORY_GROUPS_COLLAPSED && (
                <button onClick={() => setShowAllHistory(false)} className="text-xs text-blue-400 hover:underline mt-1.5">
                  Show less
                </button>
              )}
            </div>
          );
        })()}

        {locator.status === 'pending_approval' && (
          <div className="flex gap-2">
            <button onClick={() => onApprove(locator.id)} disabled={busy} className="btn-primary flex-1 justify-center py-1.5 text-xs disabled:opacity-50">
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve &amp; Open PR
            </button>
            <button onClick={() => onReject(locator.id)} disabled={busy} className="btn-secondary flex-1 justify-center py-1.5 text-xs disabled:opacity-50">
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LocatorRepositoryPanel() {
  const [locators, setLocators] = useState([]);
  const [resolvedLocators, setResolvedLocators] = useState([]);
  const [showResolved, setShowResolved] = useState(false);
  const [gitConfigured, setGitConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [message, setMessage] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await locatorsApi.getAll();
      setLocators(res.data || []);
      setResolvedLocators(res.resolved || []);
      setGitConfigured(res.gitIntegrationConfigured !== false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleApprove = async (id) => {
    setBusyId(id);
    setMessage(null);
    try {
      const res = await locatorsApi.approve(id);
      if (res.data?.gitError) setMessage({ type: 'warn', text: `Approved, but Git integration didn't complete: ${res.data.gitError}` });
      else setMessage({ type: 'success', text: 'Approved and pull request opened.' });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id) => {
    setBusyId(id);
    try {
      await locatorsApi.reject(id);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return null;
  if (locators.length === 0 && resolvedLocators.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
        <Database className="w-4 h-4 text-purple-400" /> Locator Repository
        <span className="text-xs text-gray-500 font-normal">— centralized source of truth for every healed locator, used by every execution path</span>
      </h2>
      {!gitConfigured && (
        <p className="text-xs text-gray-500">Git integration isn't configured (GITHUB_TOKEN/GITHUB_REPO) — approving marks a fix reviewed but won't open a PR automatically.</p>
      )}
      {message && (
        <p className={clsx('text-xs', message.type === 'success' ? 'text-green-400' : message.type === 'warn' ? 'text-yellow-400' : 'text-red-400')}>{message.text}</p>
      )}

      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Active Healing ({locators.length})</p>
        {locators.length === 0 ? (
          <p className="text-xs text-gray-600">No unresolved locator fixes — everything active is confirmed in source or awaiting no further action.</p>
        ) : (
          locators.map((loc) => (
            <LocatorCard key={loc.id} locator={loc} onApprove={handleApprove} onReject={handleReject} busy={busyId === loc.id} />
          ))
        )}
      </div>

      {resolvedLocators.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300"
          >
            {showResolved ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Resolved / History ({resolvedLocators.length})
          </button>
          {showResolved && (
            <div className="space-y-2">
              {resolvedLocators.map((loc) => (
                <LocatorCard key={loc.id} locator={loc} onApprove={handleApprove} onReject={handleReject} busy={busyId === loc.id} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
