// Shared contract for the AI Healing run UI — the shape useLiveHealingRunner
// produces and HealingRunView renders.

export type RunPhase = 'idle' | 'connecting' | 'running' | 'failures' | 'healing' | 'report';

export type SuiteStatus = 'pending' | 'running' | 'passed' | 'failed';

export interface SuiteState {
  key: string;
  label: string;
  status: SuiteStatus;
  progress: number; // 0-100
  logs: string[];
}

export interface FailureInfo {
  key: string;
  title: string;
  suite: string;
  reason: string;
  healable: boolean;
}

export interface HealingResult {
  reasoning: string;
  oldLocator?: string | null;
  newLocator?: string | null;
  confidence?: number;
  codeSnippet?: string | null;
}

export interface HealingCardState {
  key: string;
  title: string;
  healable: boolean;
  stepIndex: number;
  steps: string[];
  result: HealingResult | null;
  retryLogs: string[];
}

export interface TimelineEvent {
  label: string;
  detail?: string;
}

// Keys must match ExecutiveReport's CARDS exactly — it indexes stats by
// these names directly (src/components/demo/ExecutiveReport.jsx).
export interface ReportStats {
  suitesExecuted: number;
  tests: number;
  passed: number;
  initiallyFailed: number;
  aiHealed: number;
  manualInvestigation: number;
  successRate: number; // 0-100
  healingSuccess: number; // 0-100
}

export interface HealingRunState {
  phase: RunPhase;
  connectSteps: Array<{ text: string; done: boolean }>;
  suites: SuiteState[];
  revealedFailures: string[];
  healing: HealingCardState | null;
  healedKeys: string[];
  timelineCount: number;
  showConfetti: boolean;
}

export interface HealingRunEngine {
  state: HealingRunState;
  start: (...args: any[]) => void | Promise<void>;
  reset: () => void;
  reportStats: ReportStats | null;
  timeline: TimelineEvent[];
  failures: FailureInfo[];
}
