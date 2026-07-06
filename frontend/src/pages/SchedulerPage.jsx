import { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, Play, Pause, RefreshCw, Clock } from 'lucide-react';
import { schedulerApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Daily at 2 AM', value: '0 2 * * *' },
  { label: 'Daily at 9 AM (weekdays)', value: '0 9 * * 1-5' },
  { label: 'Every 30 minutes', value: '*/30 * * * *' },
  { label: 'Weekly (Monday 8 AM)', value: '0 8 * * 1' },
];

export default function SchedulerPage() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', cronExpression: '', testSuite: 'full_regression', enabled: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await schedulerApi.getAll();
      setSchedules(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await schedulerApi.create(form);
      setShowForm(false);
      setForm({ name: '', cronExpression: '', testSuite: 'full_regression', enabled: true });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (schedule) => {
    await schedulerApi.update(schedule.id, { enabled: schedule.enabled ? 0 : 1 });
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this schedule?')) return;
    await schedulerApi.delete(id);
    load();
  };

  if (loading) return <LoadingSpinner label="Loading schedules..." />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Calendar className="w-6 h-6 text-blue-400" /> Test Scheduler</h1>
          <p className="text-sm text-gray-400 mt-0.5">Configure automated test execution schedules</p>
        </div>
        <div className="flex gap-3">
          <button onClick={load} className="btn-secondary"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Schedule
          </button>
        </div>
      </div>

      {showForm && (
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold text-white mb-4">New Schedule</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Schedule Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                required
                placeholder="Nightly Full Regression"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Test Suite</label>
              <select
                value={form.testSuite}
                onChange={(e) => setForm(f => ({ ...f, testSuite: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="full_regression">Full Regression</option>
                <option value="smoke">Smoke Tests (@smoke)</option>
                <option value="regression">Regression Tests (@regression)</option>
                <option value="login">Login / Auth</option>
                <option value="cart">Cart</option>
                <option value="checkout">Checkout</option>
                <option value="inventory">Inventory / Products</option>
                <option value="e2e">End-to-End Purchase</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Cron Expression</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.cronExpression}
                  onChange={(e) => setForm(f => ({ ...f, cronExpression: e.target.value }))}
                  required
                  placeholder="0 2 * * *"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {CRON_PRESETS.map((p) => (
                  <button key={p.value} type="button" onClick={() => setForm(f => ({ ...f, cronExpression: p.value }))}
                    className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white px-2 py-1 rounded transition-colors">
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 pt-5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm(f => ({ ...f, enabled: e.target.checked }))}
                  className="w-4 h-4 accent-blue-500" />
                <span className="text-sm text-gray-300">Enable immediately</span>
              </label>
            </div>
            {error && <div className="col-span-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">{error}</div>}
            <div className="col-span-2 flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
              <button type="submit" disabled={submitting} className="btn-primary flex-1 justify-center">
                <Calendar className="w-4 h-4" />{submitting ? 'Creating...' : 'Create Schedule'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="glass-card divide-y divide-gray-800/50">
        {schedules.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>No schedules configured</p>
          </div>
        ) : (
          schedules.map((schedule) => (
            <div key={schedule.id} className="px-5 py-4 flex items-center gap-4">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${schedule.enabled && schedule.isRunning ? 'bg-green-500 animate-pulse' : schedule.enabled ? 'bg-yellow-500' : 'bg-gray-600'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{schedule.name}</p>
                  <span className={`badge ${schedule.enabled ? 'bg-green-500/15 text-green-400 border-green-500/20' : 'bg-gray-500/15 text-gray-400 border-gray-500/20'} border`}>
                    {schedule.enabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                  <span className="font-mono text-blue-400">{schedule.cron_expression}</span>
                  <span className="capitalize">{schedule.test_suite?.replace('_', ' ')}</span>
                  {schedule.last_run && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last: {new Date(schedule.last_run).toLocaleString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => handleToggle(schedule)}
                  className={`btn-secondary py-1.5 px-3 ${schedule.enabled ? 'text-yellow-400 hover:text-yellow-300' : 'text-green-400 hover:text-green-300'}`}>
                  {schedule.enabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => handleDelete(schedule.id)} className="btn-secondary py-1.5 px-3 text-red-400 hover:text-red-300">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
