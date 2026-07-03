import { useState, useEffect } from 'react';
import { Github, RefreshCw, ExternalLink, GitBranch, GitCommit, GitPullRequest, Star } from 'lucide-react';
import { githubApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDistanceToNow } from 'date-fns';

export default function GitHubPage() {
  const [repoInfo, setRepoInfo] = useState(null);
  const [commits, setCommits] = useState([]);
  const [prs, setPRs] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('commits');
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const [infoRes, commitsRes, prsRes] = await Promise.allSettled([
        githubApi.getInfo(), githubApi.getCommits({ count: 20 }), githubApi.getPRs(),
      ]);
      if (infoRes.status === 'fulfilled') setRepoInfo(infoRes.value?.data);
      if (commitsRes.status === 'fulfilled') setCommits(commitsRes.value?.data || []);
      if (prsRes.status === 'fulfilled') setPRs(prsRes.value?.data || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <LoadingSpinner label="Connecting to GitHub..." />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Github className="w-6 h-6 text-gray-300" /> GitHub Integration</h1>
          {repoInfo && (
            <p className="text-sm text-gray-400 mt-0.5">
              <span className="text-white font-medium">{repoInfo.fullName}</span> · {repoInfo.description || 'No description'}
            </p>
          )}
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Sync
        </button>
      </div>

      {/* Repo Info */}
      {repoInfo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Default Branch', value: repoInfo.defaultBranch, icon: GitBranch, color: 'text-blue-400' },
            { label: 'Branches', value: repoInfo.branches?.length || 0, icon: GitBranch, color: 'text-green-400' },
            { label: 'Open PRs', value: repoInfo.openPRs?.length || 0, icon: GitPullRequest, color: 'text-purple-400' },
            { label: 'Open Issues', value: repoInfo.openIssues, icon: Star, color: 'text-yellow-400' },
          ].map((m) => (
            <div key={m.label} className="glass-card p-4 flex items-center gap-3">
              <m.icon className={`w-5 h-5 flex-shrink-0 ${m.color}`} />
              <div>
                <p className="text-xs text-gray-400">{m.label}</p>
                <p className="text-sm font-semibold text-white">{m.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {[
          { key: 'commits', label: `Commits (${commits.length})`, icon: GitCommit },
          { key: 'prs', label: `Pull Requests (${prs.length})`, icon: GitPullRequest },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === tab.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'commits' && (
        <div className="glass-card divide-y divide-gray-800/50">
          {commits.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No commits found</div>
          ) : (
            commits.map((commit) => (
              <div key={commit.sha} className="px-5 py-3.5 flex items-start gap-4">
                <GitCommit className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{commit.message}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <code className="text-yellow-400 font-mono">{commit.sha}</code>
                    <span>by {commit.author}</span>
                    {commit.date && <span>{formatDistanceToNow(new Date(commit.date), { addSuffix: true })}</span>}
                  </div>
                </div>
                {commit.url && (
                  <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-blue-400 transition-colors flex-shrink-0">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'prs' && (
        <div className="glass-card divide-y divide-gray-800/50">
          {prs.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-sm">No open pull requests</div>
          ) : (
            prs.map((pr) => (
              <div key={pr.number} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <GitPullRequest className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white">{pr.title}</p>
                      <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-blue-400 flex-shrink-0">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>#{pr.number}</span>
                      <span>by {pr.author}</span>
                      <span className="text-blue-400">{pr.branch} → {pr.base}</span>
                      {pr.updatedAt && <span>{formatDistanceToNow(new Date(pr.updatedAt), { addSuffix: true })}</span>}
                    </div>
                    {pr.impactedModules?.length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        <span className="text-xs text-gray-500">Impacts:</span>
                        {pr.impactedModules.map(m => (
                          <span key={m} className="badge bg-blue-500/15 text-blue-400 border border-blue-500/20">{m}</span>
                        ))}
                      </div>
                    )}
                    {pr.files?.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">{pr.files.length} files changed</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
