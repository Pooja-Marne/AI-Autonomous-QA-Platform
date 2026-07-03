import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, Wrench, AlertTriangle, RefreshCw } from 'lucide-react';
import { reportsApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const COLORS = { passed: '#22c55e', failed: '#ef4444', healed: '#a855f7', not_fixable: '#f97316' };
const FAILURE_COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-gray-400 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-xs font-medium" style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await reportsApi.getAnalytics({ days });
      setAnalytics(res.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  if (loading) return <LoadingSpinner label="Loading analytics..." />;

  const { runTrend = [], moduleStability = [], healingTrend = [], topFailures = [] } = analytics || {};

  const failureTypeData = moduleStability.reduce((acc, m) => {
    if (m.failed > 0) acc.push({ name: m.module, value: m.failed });
    return acc;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-sm text-gray-400 mt-0.5">Test execution trends and insights</p>
        </div>
        <div className="flex gap-3 items-center">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button onClick={() => load(true)} disabled={refreshing} className="btn-secondary">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Run Trend */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" /> Test Execution Trend
        </h2>
        {runTrend.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No data for selected period</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={runTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
              <Bar dataKey="passed" fill={COLORS.passed} radius={[3, 3, 0, 0]} name="Passed" />
              <Bar dataKey="healed" fill={COLORS.healed} radius={[3, 3, 0, 0]} name="Healed" />
              <Bar dataKey="failed" fill={COLORS.failed} radius={[3, 3, 0, 0]} name="Failed" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Module Stability */}
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" /> Module Stability
          </h2>
          {moduleStability.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No module data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={moduleStability.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 10, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="module" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} width={60} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
                <Bar dataKey="passed" fill={COLORS.passed} radius={[0, 3, 3, 0]} name="Passed" stackId="a" />
                <Bar dataKey="failed" fill={COLORS.failed} radius={[0, 3, 3, 0]} name="Failed" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Failure Distribution */}
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400" /> Failure by Module
          </h2>
          {failureTypeData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-500 text-sm">No failure data available</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={failureTypeData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                  {failureTypeData.map((_, i) => (
                    <Cell key={`cell-${i}`} fill={FAILURE_COLORS[i % FAILURE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* AI Healing Trend */}
      {healingTrend.length > 0 && (
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-purple-400" /> AI Healing Trend
          </h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={healingTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#9ca3af' }} />
              <Line type="monotone" dataKey="total_healed" stroke="#a855f7" strokeWidth={2} dot={{ fill: '#a855f7', r: 3 }} name="Healed" />
              <Line type="monotone" dataKey="avg_confidence" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} name="Avg Confidence" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Failing Tests */}
      {topFailures.length > 0 && (
        <div className="glass-card">
          <div className="p-5 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" /> Most Unstable Tests
            </h2>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-400 uppercase">Test Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Module</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase">Failures</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-400 uppercase">Healed</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-400 uppercase">Instability</th>
              </tr>
            </thead>
            <tbody>
              {topFailures.map((t) => {
                const instability = Math.min(100, (t.failure_count / Math.max(...topFailures.map(x => x.failure_count), 1)) * 100);
                return (
                  <tr key={t.name} className="table-row">
                    <td className="px-5 py-3 text-sm text-white">{t.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{t.module}</td>
                    <td className="px-4 py-3 text-center text-sm text-red-400 font-medium">{t.failure_count}</td>
                    <td className="px-4 py-3 text-center text-sm text-purple-400 font-medium">{t.healed_count}</td>
                    <td className="px-4 py-3">
                      <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${instability}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
