import { useEffect, useState } from 'react';
import { GitBranch, GitCommit, AlertTriangle, Database } from 'lucide-react';
import clsx from 'clsx';
import { systemApi } from '../../services/api';

function commitUrl(repo, sha) {
  if (!repo || !sha) return null;
  // repo may be an "owner/repo" API-style value or a full git remote URL —
  // normalize both into a github.com/owner/repo path.
  const match = repo.match(/github\.com[/:]([^/]+\/[^/.]+)/) || repo.match(/^([^/]+\/[^/]+)$/);
  return match ? `https://github.com/${match[1]}/commit/${sha}` : null;
}

export default function SourceInfoBar() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    systemApi.getSourceInfo().then((res) => setInfo(res.data)).catch(() => setInfo(null));
  }, []);

  if (!info) return null;

  const shortSha = info.commitSha ? info.commitSha.slice(0, 7) : '—';
  const url = commitUrl(info.repo, info.commitSha);

  return (
    <div className="glass-card p-3 flex items-center gap-4 flex-wrap text-xs">
      <span className="flex items-center gap-1.5 text-gray-400">
        <GitBranch className="w-3.5 h-3.5" /> {info.branch || '—'}
      </span>
      <span className="flex items-center gap-1.5 text-gray-400">
        <GitCommit className="w-3.5 h-3.5" />
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-400 hover:underline">{shortSha}</a>
        ) : (
          <span className="font-mono">{shortSha}</span>
        )}
      </span>
      {info.author && <span className="text-gray-500">by {info.author}</span>}
      <span className="flex items-center gap-1.5 text-gray-500">
        <Database className="w-3.5 h-3.5" />
        {info.locatorCache.loaded ? `${info.locatorCache.entryCount} locator(s) active` : 'no locator cache yet'}
      </span>

      {info.upToDate === false && (
        <span className="flex items-center gap-1.5 text-yellow-400 ml-auto">
          <AlertTriangle className="w-3.5 h-3.5" />
          Running an older commit than {info.branch}'s latest ({info.latestCommitSha?.slice(0, 7)}) — a deploy may still be in progress.
        </span>
      )}
      {info.upToDate === null && info.checkError && (
        <span className={clsx('text-gray-600 ml-auto')}>Up-to-date check unavailable: {info.checkError}</span>
      )}
    </div>
  );
}
