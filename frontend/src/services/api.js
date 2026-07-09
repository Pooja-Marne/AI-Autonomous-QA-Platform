import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message = err.response?.data?.error || err.message || 'Request failed';
    return Promise.reject(new Error(message));
  }
);

export const runsApi = {
  getAll: (params) => api.get('/runs', { params }),
  getById: (id) => api.get(`/runs/${id}`),
  getStats: () => api.get('/runs/stats'),
  create: (data) => api.post('/runs', data),
  delete: (id) => api.delete(`/runs/${id}`),
  getTestCases: (id, params) => api.get(`/runs/${id}/test-cases`, { params }),
  getLive: (id) => api.get(`/runs/${id}/live`),
};

export const jiraApi = {
  getSprint: () => api.get('/jira/sprint'),
  getBugs: () => api.get('/jira/bugs'),
  getIssues: () => api.get('/jira/issues'),
  getCached: () => api.get('/jira/cached'),
  getClosed: () => api.get('/jira/closed'),
  getFailedTests: () => api.get('/jira/failed-tests'),
  createIssue: (data) => api.post('/jira/issues', data),
  addComment: (key, comment) => api.post(`/jira/issues/${key}/comment`, { comment }),
};

export const healingApi = {
  analyze: (data) => api.post('/healing/analyze', data),
  heal: (testCaseId) => api.post(`/healing/heal/${testCaseId}`),
  getStats: (runId) => api.get('/healing/stats', { params: { runId } }),
  getActions: (params) => api.get('/healing/actions', { params }),
  getJiraLinkedActions: (params) => api.get('/healing/actions', { params: { ...params, jiraOnly: true } }),
};

export const reportsApi = {
  getAll: () => api.get('/reports'),
  getByRunId: (runId) => api.get(`/reports/${runId}`),
  generate: (runId) => api.post(`/reports/generate/${runId}`),
  getAnalytics: (params) => api.get('/reports/analytics', { params }),
};

export const schedulerApi = {
  getAll: () => api.get('/scheduler'),
  create: (data) => api.post('/scheduler', data),
  update: (id, data) => api.put(`/scheduler/${id}`, data),
  delete: (id) => api.delete(`/scheduler/${id}`),
};

export const triggersApi = {
  getPending: () => api.get('/triggers/pending'),
  getHistory: (params) => api.get('/triggers/history', { params }),
  respond: (id, data) => api.post(`/triggers/${id}/respond`, data),
  createManual: (issueKey) => api.post('/triggers/manual', { issueKey }),
  pollNow: () => api.post('/triggers/poll'),
};

export const coverageApi = {
  getAnalyses: (params) => api.get('/coverage/analyses', { params }),
  getAnalysis: (jiraKey, params) => api.get(`/coverage/analyses/${jiraKey}`, { params }),
  analyzeIssue: (jiraKey) => api.post('/coverage/analyze', { jiraKey }),
  analyzeSprint: () => api.post('/coverage/analyze-sprint'),
  getStatus: () => api.get('/coverage/status'),
  getSprintSummary: (params) => api.get('/coverage/sprint-summary', { params }),
};

export const demoHealingApi = {
  getStatus: () => api.get('/demo-healing/status'),
  getRuns: (params) => api.get('/demo-healing/runs', { params }),
  getLocators: () => api.get('/demo-healing/locators'),
  reset: () => api.post('/demo-healing/reset'),
};

export default api;
