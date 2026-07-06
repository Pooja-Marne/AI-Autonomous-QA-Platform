import { motion } from 'framer-motion';
import { Layers, ListChecks, CheckCircle2, XCircle, Sparkles, AlertTriangle, TrendingUp, Wrench } from 'lucide-react';
import AnimatedCounter from './AnimatedCounter';

const CARDS = [
  { key: 'suitesExecuted', label: 'Suites Executed', icon: Layers, gradient: 'from-blue-500/20 to-blue-600/5', text: 'text-blue-400', suffix: '' },
  { key: 'tests', label: 'Tests', icon: ListChecks, gradient: 'from-gray-500/20 to-gray-600/5', text: 'text-gray-200', suffix: '' },
  { key: 'passed', label: 'Passed', icon: CheckCircle2, gradient: 'from-green-500/20 to-green-600/5', text: 'text-green-400', suffix: '' },
  { key: 'initiallyFailed', label: 'Initially Failed', icon: XCircle, gradient: 'from-red-500/20 to-red-600/5', text: 'text-red-400', suffix: '' },
  { key: 'aiHealed', label: 'AI Healed', icon: Sparkles, gradient: 'from-purple-500/20 to-purple-600/5', text: 'text-purple-400', suffix: '' },
  { key: 'manualInvestigation', label: 'Manual Investigation', icon: AlertTriangle, gradient: 'from-orange-500/20 to-orange-600/5', text: 'text-orange-400', suffix: '' },
  { key: 'successRate', label: 'Success Rate', icon: TrendingUp, gradient: 'from-green-500/20 to-emerald-600/5', text: 'text-green-400', suffix: '%' },
  { key: 'healingSuccess', label: 'Healing Success', icon: Wrench, gradient: 'from-blue-500/20 to-purple-600/5', text: 'text-blue-400', suffix: '%' },
];

export default function ExecutiveReport({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {CARDS.map((c, i) => {
        const Icon = c.icon;
        return (
          <motion.div
            key={c.key}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.07, type: 'spring', stiffness: 200, damping: 20 }}
            className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${c.gradient} backdrop-blur-sm p-5`}
          >
            <div className="flex items-start justify-between">
              <Icon className={`w-5 h-5 ${c.text} opacity-80`} />
            </div>
            <p className={`text-3xl font-bold mt-3 ${c.text}`}>
              <AnimatedCounter value={stats[c.key]} suffix={c.suffix} />
            </p>
            <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider">{c.label}</p>
          </motion.div>
        );
      })}
    </div>
  );
}
