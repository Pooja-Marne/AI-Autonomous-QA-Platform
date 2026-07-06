import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, Circle } from 'lucide-react';
import clsx from 'clsx';

const STATUS_CONFIG = {
  pending: { icon: Circle, color: 'text-gray-600', bar: 'bg-gray-700' },
  running: { icon: Loader2, color: 'text-blue-400', bar: 'bg-blue-500', spin: true },
  passed: { icon: CheckCircle2, color: 'text-green-400', bar: 'bg-green-500' },
  failed: { icon: XCircle, color: 'text-red-400', bar: 'bg-red-500' },
};

function SuiteRow({ suite }) {
  const cfg = STATUS_CONFIG[suite.status];
  const Icon = cfg.icon;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-white font-medium">
          <Icon className={clsx('w-4 h-4', cfg.color, cfg.spin && 'animate-spin')} />
          {suite.label}
        </span>
        <span className="text-xs text-gray-500">{suite.tests} tests</span>
      </div>
      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
        <motion.div
          className={clsx('h-full rounded-full', cfg.bar)}
          initial={{ width: 0 }}
          animate={{ width: `${suite.progress}%` }}
          transition={{ ease: 'easeOut', duration: 0.3 }}
        />
      </div>
    </div>
  );
}

export default function SuiteProgress({ suites }) {
  return (
    <div className="space-y-4">
      {suites.map((s) => <SuiteRow key={s.key} suite={s} />)}
    </div>
  );
}
