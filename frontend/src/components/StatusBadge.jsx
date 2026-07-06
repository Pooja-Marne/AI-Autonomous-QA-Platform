import clsx from 'clsx';

const STATUS_CONFIG = {
  passed: { label: 'Passed', classes: 'bg-green-500/15 text-green-400 border border-green-500/20' },
  failed: { label: 'Failed', classes: 'bg-red-500/15 text-red-400 border border-red-500/20' },
  healed: { label: 'Healed', classes: 'bg-purple-500/15 text-purple-400 border border-purple-500/20' },
  skipped: { label: 'Skipped', classes: 'bg-gray-500/15 text-gray-400 border border-gray-500/20' },
  running: { label: 'Running', classes: 'bg-blue-500/15 text-blue-400 border border-blue-500/20 animate-pulse' },
  healing: { label: 'Healing', classes: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20 animate-pulse' },
  pending: { label: 'Pending', classes: 'bg-gray-500/15 text-gray-400 border border-gray-500/20' },
  completed: { label: 'Completed', classes: 'bg-green-500/15 text-green-400 border border-green-500/20' },
  partially_healed: { label: 'Partially Healed', classes: 'bg-orange-500/15 text-orange-400 border border-orange-500/20' },
  not_fixable: { label: 'Not Fixable', classes: 'bg-red-500/15 text-red-400 border border-red-500/20' },
  locator_issue: { label: 'Locator Issue', classes: 'bg-orange-500/15 text-orange-400 border border-orange-500/20' },
  api_mismatch: { label: 'API Mismatch', classes: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' },
  data_issue: { label: 'Data Issue', classes: 'bg-pink-500/15 text-pink-400 border border-pink-500/20' },
  environment_issue: { label: 'Env Issue', classes: 'bg-red-500/15 text-red-400 border border-red-500/20' },
  assertion_failure: { label: 'Assertion', classes: 'bg-purple-500/15 text-purple-400 border border-purple-500/20' },
  timeout: { label: 'Timeout', classes: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' },
  unknown: { label: 'Unknown', classes: 'bg-gray-500/15 text-gray-400 border border-gray-500/20' },
  fully_covered: { label: '✅ Fully Covered', classes: 'bg-green-500/15 text-green-400 border border-green-500/20' },
  partially_covered: { label: '⚠ Partially Covered', classes: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20' },
  no_automation: { label: '❌ No Automation Found', classes: 'bg-red-500/15 text-red-400 border border-red-500/20' },
};

export default function StatusBadge({ status, className }) {
  const cfg = STATUS_CONFIG[status] || { label: status || 'Unknown', classes: 'bg-gray-500/15 text-gray-400 border border-gray-500/20' };
  return (
    <span className={clsx('badge', cfg.classes, className)}>
      {cfg.label}
    </span>
  );
}
