import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, XCircle, AlertTriangle, Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { coverageApi } from '../services/api';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';

const RISK_COLORS = {
  Low: 'text-green-400 bg-green-400/10',
  Medium: 'text-yellow-400 bg-yellow-400/10',
  High: 'text-orange-400 bg-orange-400/10',
  Critical: 'text-red-400 bg-red-400/10',
};

const TEST_CASE_GROUPS = ['ui', 'api', 'positive', 'negative', 'boundary', 'validation', 'regression', 'edge'];

function RiskPill({ level }) {
  return (
    <span className={clsx('inline-flex text-xs font-medium px-2 py-0.5 rounded-full', RISK_COLORS[level] || 'text-gray-400 bg-gray-400/10')}>
      {level || 'N/A'}
    </span>
  );
}

function IssueCard({ report }) {
  const [expanded, setExpanded] = useState(false);
  const suggested = report.suggested_test_cases || {};

  return (
    <div className="glass-card overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-mono text-blue-400 flex-shrink-0">{report.jira_key}</span>
          <span className="text-sm text-white truncate">{report.summary}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <StatusBadge status={report.coverage_status} />
          <RiskPill level={report.release_risk} />
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-1 space-y-4 border-t border-gray-800/60">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Changed Modules</p>
              <p className="text-sm text-gray-300 mt-1">{(report.changed_modules || []).join(', ') || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Automation Coverage</p>
              <p className="text-sm text-gray-300 mt-1">{report.automation_coverage_pct ?? 0}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Confidence</p>
              <p className="text-sm text-gray-300 mt-1">{report.confidence_score ?? '—'}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Overall Readiness</p>
              <p className="text-sm text-gray-300 mt-1">{report.overall_readiness || '—'}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Existing Test Cases ({(report.existing_test_cases || []).length})</p>
            {(report.existing_test_cases || []).length === 0 ? (
              <p className="text-sm text-gray-500">None found in the automation repo.</p>
            ) : (
              <ul className="text-sm text-gray-300 space-y-1">
                {report.existing_test_cases.slice(0, 8).map((tc, i) => (
                  <li key={i} className="flex items-center gap-2">
                    {tc.passing ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                    <span className="truncate">{tc.title}</span>
                    <span className="text-xs text-gray-600 flex-shrink-0">{tc.file}</span>
                    {tc.flaky && <span className="text-xs text-yellow-400 flex-shrink-0">flaky</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Missing Test Cases</p>
            <ul className="text-sm text-gray-300 list-disc list-inside space-y-0.5">
              {(report.missing_test_cases || []).map((tc, i) => <li key={i}>{tc}</li>)}
              {(report.missing_test_cases || []).length === 0 && <li className="list-none text-gray-500">None</li>}
            </ul>
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Suggested New Test Cases</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {TEST_CASE_GROUPS.filter((g) => (suggested[g] || []).length > 0).map((g) => (
                <div key={g}>
                  <p className="text-xs text-blue-400 uppercase font-medium mb-1">{g}</p>
                  <ul className="text-xs text-gray-400 space-y-0.5 list-disc list-inside">
                    {suggested[g].map((tc, i) => <li key={i}>{tc}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-800/60">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Recommended Regression Suites</p>
              <p className="text-sm text-gray-300 mt-1">{(report.recommended_regression_suites || []).join(', ') || '—'}</p>
              <p className="text-xs text-gray-500 mt-1">{report.regression_reason}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider flex items-center gap-1"><Sparkles className="w-3.5 h-3.5 text-purple-400" /> AI Recommendation</p>
              <ul className="text-sm text-gray-300 mt-1 list-disc list-inside space-y-0.5">
                {(report.ai_recommendations || []).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CoveragePage() {
  const [searchParams] = useSearchParams();
  const [summary, setSummary] = useState(null);
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobStatus, setJobStatus] = useState({ running: false });
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [summaryRes, analysesRes] = await Promise.allSettled([
        coverageApi.getSprintSummary(),
        coverageApi.getAnalyses(),
      ]);
      if (summaryRes.status === 'fulfilled') setSummary(summaryRes.value?.data || null);
      if (analysesRes.status === 'fulfilled') setAnalyses(analysesRes.value?.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  const startAnalysis = async () => {
    await coverageApi.analyzeSprint();
    setJobStatus({ running: true, completed: 0, total: 0 });
    pollRef.current = setInterval(async () => {
      const res = await coverageApi.getStatus();
      const status = res.data;
      setJobStatus(status);
      if (!status.running) {
        clearInterval(pollRef.current);
        load();
      }
    }, 3000);
  };

  const highlightKey = searchParams.get('jiraKey');
  const sortedAnalyses = highlightKey
    ? [...analyses].sort((a, b) => (a.jira_key === highlightKey ? -1 : b.jira_key === highlightKey ? 1 : 0))
    : analyses;

  if (loading) return <LoadingSpinner label="Loading coverage intelligence..." />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-blue-400" /> Sprint Coverage Intelligence
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {summary ? `Active Sprint: ` : 'No sprint analyzed yet — run an analysis to get started.'}
            {summary && <span className="text-blue-400 font-medium">{summary.sprint_name}</span>}
          </p>
        </div>
        <button onClick={startAnalysis} disabled={jobStatus.running} className="btn-primary">
          <RefreshCw className={clsx('w-4 h-4', jobStatus.running && 'animate-spin')} />
          {jobStatus.running ? `Analyzing (${jobStatus.completed}/${jobStatus.total})...` : 'Analyze Active Sprint'}
        </button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Stories Closed" value={summary.stories_closed} icon={CheckCircle2} color="blue" />
            <StatCard label="Bugs Closed" value={summary.bugs_closed} icon={AlertTriangle} color="orange" />
            <StatCard label="Automation Coverage" value={`${summary.automation_coverage_pct ?? 0}%`} icon={ShieldCheck} color="purple" />
            <StatCard label="Release Readiness" value={`${summary.release_readiness_score ?? 0}/100`} icon={Sparkles} color="green" />
          </div>

          <div className={clsx(
            'glass-card p-5 border-l-4',
            summary.can_release === 'YES' ? 'border-green-500' : 'border-red-500'
          )}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Can Sprint Be Released?</p>
                <p className={clsx('text-3xl font-bold mt-1', summary.can_release === 'YES' ? 'text-green-400' : 'text-red-400')}>
                  {summary.can_release}
                </p>
                <p className="text-sm text-gray-400 mt-1">{summary.reason}</p>
              </div>
            </div>
            <p className="text-sm text-gray-300 mt-3 pt-3 border-t border-gray-800/60">{summary.ai_recommendation}</p>
            {(summary.highRiskModules || []).length > 0 && (
              <p className="text-xs text-orange-400 mt-2">High-Risk Modules: {summary.highRiskModules.join(', ')}</p>
            )}
          </div>
        </>
      )}

      <div className="space-y-3">
        {sortedAnalyses.length === 0 ? (
          <div className="glass-card p-12 text-center text-gray-500">
            <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No coverage analyses yet. Click "Analyze Active Sprint" above.</p>
          </div>
        ) : (
          sortedAnalyses.map((report) => <IssueCard key={report.id} report={report} />)
        )}
      </div>
    </div>
  );
}
