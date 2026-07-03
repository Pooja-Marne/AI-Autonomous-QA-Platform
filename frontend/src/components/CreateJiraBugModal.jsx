import { useState } from 'react';
import { Bug, X, ExternalLink, Loader2, CheckCircle } from 'lucide-react';
import { jiraApi } from '../services/api';

const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
const ISSUE_TYPES = ['Bug', 'Task', 'Story'];

export default function CreateJiraBugModal({ prefill = {}, onClose, onCreated }) {
  const [form, setForm] = useState({
    summary: prefill.summary || '',
    description: prefill.description || '',
    issueType: prefill.issueType || 'Bug',
    priority: prefill.priority || 'High',
  });
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.summary.trim()) { setError('Summary is required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await jiraApi.createIssue(form);
      setCreated(res.data);
      onCreated?.(res.data);
    } catch (err) {
      setError(err.message || 'Failed to create Jira issue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Bug className="w-5 h-5 text-red-400" />
            {created ? 'Bug Created in Jira' : 'Create Jira Bug'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success state */}
        {created ? (
          <div className="px-6 py-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-lg">Bug created successfully!</p>
              <p className="text-gray-400 text-sm mt-1">Jira issue key: <span className="text-blue-400 font-mono font-semibold">{created.key}</span></p>
            </div>
            <a
              href={created.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              View in Jira: {created.key}
            </a>
            <button onClick={onClose} className="block w-full mt-2 py-2 text-sm text-gray-400 hover:text-white transition-colors">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Summary */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Summary <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="Brief description of the bug..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={4}
                placeholder="Steps to reproduce, error details, expected vs actual behaviour..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Type + Priority row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Issue Type</label>
                <select
                  value={form.issueType}
                  onChange={(e) => setForm({ ...form, issueType: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  {ISSUE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bug className="w-4 h-4" />}
                {loading ? 'Creating...' : 'Create Bug in Jira'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
