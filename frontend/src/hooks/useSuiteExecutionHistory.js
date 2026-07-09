import { useCallback, useEffect, useState } from 'react';
import { runsApi } from '../services/api';

// Drives the "click a suite, browse its executions" view on the AI Healing
// page: fetches the latest execution for a suite by default, lets the user
// switch between previous runs of that suite, and loads full detail
// (test cases, real self-healing records, runtime logs) for whichever run
// is selected.
export function useSuiteExecutionHistory() {
  const [suite, setSuite] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState(null);

  const loadDetail = useCallback(async (runId) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await runsApi.getById(runId);
      setDetail(res.data);
      setSelectedRunId(runId);
    } catch (err) {
      setError(err.message);
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const selectSuite = useCallback(async (suiteKey) => {
    setSuite(suiteKey);
    setLoadingList(true);
    setError(null);
    setDetail(null);
    setSelectedRunId(null);
    try {
      const res = await runsApi.getBySuite(suiteKey, { limit: 10 });
      const runs = res.data || [];
      setExecutions(runs);
      if (runs.length) await loadDetail(runs[0].id);
    } catch (err) {
      setError(err.message);
      setExecutions([]);
    } finally {
      setLoadingList(false);
    }
  }, [loadDetail]);

  // Requirement: the page shows the latest execution by default when opened,
  // before the user has clicked anything.
  useEffect(() => {
    (async () => {
      setLoadingList(true);
      try {
        const { data: latest } = await runsApi.getLatest();
        if (!latest) return;
        if (latest.suite) {
          const { data: runs } = await runsApi.getBySuite(latest.suite, { limit: 10 });
          setSuite(latest.suite);
          setExecutions(runs || []);
        } else {
          setExecutions([latest]);
        }
        await loadDetail(latest.id);
      } catch {
        /* nothing to default to yet — empty state handles it */
      } finally {
        setLoadingList(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Call after a new live run finishes so its history reflects immediately.
  const refresh = useCallback(() => {
    if (suite) selectSuite(suite);
  }, [suite, selectSuite]);

  return {
    suite, executions, selectedRunId, detail,
    loadingList, loadingDetail, error,
    selectSuite, selectRun: loadDetail, refresh,
  };
}
