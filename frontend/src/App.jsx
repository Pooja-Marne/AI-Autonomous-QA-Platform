import { useState, useEffect, useCallback } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import JiraTriggerPrompt from './components/JiraTriggerPrompt';
import LiveHealingModal from './components/healing/LiveHealingModal';
import Dashboard from './pages/Dashboard';
import TestRuns from './pages/TestRuns';
import RunDetails from './pages/RunDetails';
import Analytics from './pages/Analytics';
import AIHealingPage from './pages/AIHealingPage';
import JiraPage from './pages/JiraPage';
import CoveragePage from './pages/CoveragePage';
import { triggersApi } from './services/api';

function AppShell() {
  const [pendingTriggers, setPendingTriggers] = useState([]);
  const [liveRunId, setLiveRunId] = useState(null);

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
      // Show the live healing modal in place instead of navigating away —
      // uses the same run view/components as the AI Healing page and demo.
      setLiveRunId(result.runId);
    }
  }, []);

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
            <Route path="/healing" element={<AIHealingPage />} />
            <Route path="/jira" element={<JiraPage />} />
            <Route path="/coverage" element={<CoveragePage />} />
          </Routes>
        </div>
      </main>

      {/* Global Jira trigger prompt — appears on any page */}
      <JiraTriggerPrompt
        triggers={pendingTriggers}
        onDecision={handleDecision}
      />

      {liveRunId && (
        <LiveHealingModal runId={liveRunId} onClose={() => setLiveRunId(null)} />
      )}
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
