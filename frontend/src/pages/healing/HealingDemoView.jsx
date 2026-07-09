import { useDemoRunner } from '../../hooks/useDemoRunner';
import HealingRunView from '../../components/healing/HealingRunView';

export default function HealingDemoView() {
  const { state, start, reset, reportStats, timeline, failures } = useDemoRunner();

  return (
    <HealingRunView
      state={state}
      failures={failures}
      timeline={timeline}
      reportStats={reportStats}
      onStart={start}
      onReset={reset}
      startLabel="Run Demo"
      idleHint={(
        <>Click <span className="text-purple-400 font-medium">Run Demo</span> to simulate a full regression run, live AI failure analysis, and self-healing — no real app required.</>
      )}
    />
  );
}
