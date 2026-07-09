// Shared contract for the AI Healing run UI. Both the scripted demo engine
// (useDemoRunner) and the real-data engine (useLiveHealingRunner) produce
// this exact shape so a single presentational component (HealingRunView)
// can render either without knowing which one is feeding it.

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

export interface ReportStats {
  totalTests: number;
  passed: number;
  failed: number;
  healed: number;
  notFixable: number;
  durationMs?: number;
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
