import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Play, Trash2, RefreshCw, ChevronRight, Filter, Search } from 'lucide-react';
import { runsApi } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import TriggerRunModal from '../components/TriggerRunModal';
import { timeAgo, fullDateTime, formatDuration } from '../utils/dateUtils';

export default function TestRuns() {
  const [runs, setRuns] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const LIMIT = 15;

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await runsApi.getAll({ page, limit: LIMIT });
      setRuns(res.runs || []);
      setTotal(res.total || 0);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const i = setInterval(() => load(true), 30000);
    return () => clearInterval(i);
  }, [load]);

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this run and all its data?')) return;
    await runsApi.delete(id);
    load(true);
  };

  const filtered = runs.filter((r) => {
    const matchSearch = !search || r.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.ceil(total / LIMIT);


  if (loading) return <LoadingSpinner label="Loading test runs..." />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Test Runs</h1>
          <p className="text-sm text-gray-400 mt-0.5">{total} total runs</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            <Play className="w-4 h-4" /> New Run
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search runs..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Status</option>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
          <option value="partially_healed">Partially Healed</option>
          <option value="running">Running</option>
          <option value="healing">Healing</option>
        </select>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Run Name</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Tests</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Pass</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Fail</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Healed</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Branch</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Duration</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider">Started</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-gray-500">
                  <Play className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No test runs found</p>
                </td>
              </tr>
            ) : (
              filtered.map((run) => (
                <tr key={run.id} className="table-row">
                  <td className="px-5 py-3.5">
                    <Link to={`/runs/${run.id}`} className="font-medium text-white text-sm hover:text-blue-400 transition-colors flex items-center gap-1">
                      {run.name}
                      <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100" />
                    </Link>
                    <p className="text-xs text-gray-500 mt-0.5 font-mono">{run.id.substring(0, 8)}...</p>
                  </td>
                  <td className="px-4 py-3.5"><StatusBadge status={run.status} /></td>
                  <td className="px-4 py-3.5 text-center text-sm text-gray-300">{run.total_tests}</td>
                  <td className="px-4 py-3.5 text-center text-sm text-green-400 font-medium">{run.passed}</td>
                  <td className="px-4 py-3.5 text-center text-sm text-red-400 font-medium">{run.failed}</td>
                  <td className="px-4 py-3.5 text-center text-sm text-purple-400 font-medium">{run.healed}</td>
                  <td className="px-4 py-3.5 text-xs font-mono text-gray-400">{run.branch || '—'}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-400">{formatDuration(run.duration_ms)}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-400" title={fullDateTime(run.created_at)}>
                    {timeAgo(run.created_at)}
                  </td>
                  <td className="px-4 py-3.5">
                    <button onClick={(e) => handleDelete(run.id, e)} className="text-gray-600 hover:text-red-400 transition-colors p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-400">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary py-1.5 px-3 disabled:opacity-40">Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-secondary py-1.5 px-3 disabled:opacity-40">Next</button>
          </div>
        </div>
      )}

      {showModal && (
        <TriggerRunModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); setTimeout(() => load(true), 2000); }}
        />
      )}
    </div>
  );
}
