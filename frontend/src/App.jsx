import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import JiraTriggerPrompt from './components/JiraTriggerPrompt';
import Dashboard from './pages/Dashboard';
import TestRuns from './pages/TestRuns';
import RunDetails from './pages/RunDetails';
import Analytics from './pages/Analytics';
import HealingPage from './pages/HealingPage';
import JiraPage from './pages/JiraPage';
import GitHubPage from './pages/GitHubPage';
import SchedulerPage from './pages/SchedulerPage';
import TriggersPage from './pages/TriggersPage';
import { triggersApi } from './services/api';

function AppShell() {
  const [pendingTriggers, setPendingTriggers] = useState([]);
  const navigate = useNavigate();

  const fetchPending = useCallback(async () => {
    try {
      const res = await triggersApi.getPending();
      setPendingTriggers(res.data || []);
    } catch {
      // silently ignore if backend is down
    }
  }, []);

  useEffect(() => {
    fetchPending();
    // Poll every 30 seconds for new Jira trigger events
    const interval = setInterval(fetchPending, 30000);
    return () => clearInterval(interval);
  }, [fetchPending]);

  const handleDecision = useCallback((triggerId, result) => {
    // Remove resolved trigger from the prompt
    setPendingTriggers((prev) => prev.filter((t) => t.id !== triggerId));

    if (result.action === 'run_started' && result.runId) {
      // Navigate to the run details page
      setTimeout(() => navigate(`/runs/${result.runId}`), 300);
    }
  }, [navigate]);

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar />
      <main className="flex-1 ml-64 min-h-screen">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/runs" element={<TestRuns />} />
            <Route path="/runs/:id" element={<RunDetails />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/healing" element={<HealingPage />} />
            <Route path="/jira" element={<JiraPage />} />
            <Route path="/github" element={<GitHubPage />} />
            <Route path="/scheduler" element={<SchedulerPage />} />
            <Route path="/triggers" element={<TriggersPage />} />
          </Routes>
        </div>
      </main>

      {/* Global Jira trigger prompt — appears on any page */}
      <JiraTriggerPrompt
        triggers={pendingTriggers}
        onDecision={handleDecision}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
