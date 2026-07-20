import clsx from 'clsx';

const STAGES = ['Broken', 'AI Healed', 'PR Created', 'PR Merged', 'Deployment Completed', 'Resolved'];

// Derives the locator's position in the fixed lifecycle from its existing
// status/git_status fields — no new column needed. "Deployment Completed"
// is a rendering label for "PR merged, not yet source-confirmed" rather than
// an independently observable event (no deploy-webhook integration exists in
// this codebase); stage 5 (resolved) is what turns it into a confirmed,
// audit-grade state via resolveIfSourceMatches on the backend.
function computeStage(locator) {
  if (locator.status === 'resolved') return 5;
  if (locator.git_status === 'pr_merged') return 3;
  if (['pr_open', 'committed'].includes(locator.git_status)) return 2;
  if (locator.status === 'pending_approval' || locator.status === 'approved') return 1;
  return 0;
}

export default function LocatorLifecycleStepper({ locator }) {
  const stage = computeStage(locator);
  // Approved, but the PR attempt itself failed (or its PR was closed
  // unmerged) — otherwise indistinguishable from "PR never attempted",
  // since both leave computeStage's result looking identical (stage 1,
  // "PR Created" still a plain future step) despite being very different
  // situations for the user to act on.
  const failedStepIndex = locator.status === 'approved' && ['failed', 'pr_closed_unmerged'].includes(locator.git_status)
    ? stage + 1
    : -1;

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {STAGES.map((label, i) => (
        <div key={label} className="flex items-center flex-shrink-0">
          <div className="flex flex-col items-center gap-1 min-w-[64px]">
            <span
              className={clsx(
                'w-2.5 h-2.5 rounded-full flex-shrink-0',
                i === failedStepIndex && 'bg-red-500 ring-2 ring-red-500/30',
                i !== failedStepIndex && i < stage && 'bg-emerald-400',
                i !== failedStepIndex && i === stage && 'bg-purple-400 ring-2 ring-purple-400/30',
                i !== failedStepIndex && i > stage && 'bg-gray-700'
              )}
            />
            <span
              className={clsx(
                'text-[10px] text-center leading-tight whitespace-nowrap',
                i === failedStepIndex ? 'text-red-400' : i <= stage ? 'text-gray-300' : 'text-gray-600'
              )}
            >
              {i === failedStepIndex ? 'PR Failed' : label}
            </span>
          </div>
          {i < STAGES.length - 1 && (
            <span className={clsx(
              'h-px w-6 -mt-4 flex-shrink-0',
              i + 1 === failedStepIndex ? 'bg-red-500/60' : i < stage ? 'bg-emerald-400/60' : 'bg-gray-700'
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
