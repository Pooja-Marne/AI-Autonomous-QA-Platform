import { useCallback, useEffect, useState } from 'react';
import { runsApi } from '../services/api';

// Drives the "click a suite, browse its executions" view on the AI Healing
// page: fetches the latest execution for a suite by default, lets the user
// switch between previous runs of that suite, and loads full detail
// (test cases, real self-healing records, runtime logs) for whichever run
// is selected.
const PAGE_SIZE = 10;

export function useSuiteExecutionHistory() {
  const [suite, setSuite] = useState(null);
  const [executions, setExecutions] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
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
    setPage(1);
    try {
      const res = await runsApi.getBySuite(suiteKey, { limit: PAGE_SIZE, page: 1 });
      const runs = res.data || [];
      setExecutions(runs);
      setTotal(res.total ?? runs.length);
      if (runs.length) await loadDetail(runs[0].id);
    } catch (err) {
      setError(err.message);
      setExecutions([]);
      setTotal(0);
    } finally {
      setLoadingList(false);
    }
  }, [loadDetail]);

  // Fetches the next page and appends — a "Load More" click, not a replace.
  const loadMore = useCallback(async () => {
    if (!suite || loadingMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await runsApi.getBySuite(suite, { limit: PAGE_SIZE, page: nextPage });
      setExecutions((prev) => [...prev, ...(res.data || [])]);
      setTotal(res.total ?? total);
      setPage(nextPage);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }, [suite, page, loadingMore, total]);

  // Requirement: the page shows the latest execution by default when opened,
  // before the user has clicked anything.
  useEffect(() => {
    (async () => {
      setLoadingList(true);
      try {
        const { data: latest } = await runsApi.getLatest();
        if (!latest) return;
        if (latest.suite) {
          const res = await runsApi.getBySuite(latest.suite, { limit: PAGE_SIZE, page: 1 });
          setSuite(latest.suite);
          setExecutions(res.data || []);
          setTotal(res.total ?? (res.data || []).length);
        } else {
          setExecutions([latest]);
          setTotal(1);
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
    suite, executions, total, hasMore: executions.length < total, loadingMore,
    selectedRunId, detail,
    loadingList, loadingDetail, error,
    selectSuite, selectRun: loadDetail, refresh, loadMore,
  };
}
