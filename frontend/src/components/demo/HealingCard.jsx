import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2, Circle, AlertTriangle, Sparkles, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

function ThoughtStep({ text, state }) {
  // state: 'pending' | 'active' | 'done'
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: state === 'pending' ? 0.35 : 1, x: 0 }}
      className="flex items-center gap-2 text-sm"
    >
      {state === 'done' ? (
        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
      ) : state === 'active' ? (
        <Loader2 className="w-4 h-4 text-blue-400 animate-spin flex-shrink-0" />
      ) : (
        <Circle className="w-3.5 h-3.5 text-gray-700 flex-shrink-0" />
      )}
      <span className={clsx(state === 'done' ? 'text-gray-300' : state === 'active' ? 'text-white font-medium' : 'text-gray-600')}>
        {text}
      </span>
    </motion.div>
  );
}

function LocatorDiff({ oldLocator, newLocator }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-2 bg-gray-900/60 border border-gray-800 rounded-lg p-3">
      <div>
        <p className="text-xs text-gray-500 mb-1">Old</p>
        <code className="text-xs text-red-400 break-all">{oldLocator}</code>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-600 hidden sm:block" />
      <div>
        <p className="text-xs text-gray-500 mb-1">New</p>
        <code className="text-xs text-green-400 break-all">{newLocator}</code>
      </div>
    </div>
  );
}

/** Live "AI is thinking" card for the currently-healing failure. */
export default function HealingCard({ healing }) {
  if (!healing) return null;
  const { title, healable, stepIndex, steps, result, retryLogs } = healing;
  const thinking = stepIndex < steps.length;

  return (
    <motion.div
      key={healing.key}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-5 border border-purple-500/20 space-y-4"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-purple-600/20 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">AI Healing: {title}</p>
          <p className="text-xs text-gray-500">{thinking ? 'Analyzing...' : result ? 'Analysis complete' : ''}</p>
        </div>
      </div>

      <div className="space-y-2 pl-1">
        {steps.map((s, i) => (
          <ThoughtStep key={s} text={s} state={i < stepIndex ? 'done' : i === stepIndex ? 'active' : 'pending'} />
        ))}
      </div>

      <AnimatePresence>
        {result && healable && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 pt-2 border-t border-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Confidence</span>
              <span className="text-lg font-bold text-green-400">{result.confidenceLabel}</span>
            </div>
            <LocatorDiff oldLocator={result.oldLocator} newLocator={result.newLocator} />
            <p className="text-xs text-gray-400 leading-relaxed">{result.reasoning}</p>
            {retryLogs.length > 0 && (
              <div className="bg-black/50 rounded-lg p-2 font-mono text-xs space-y-0.5">
                {retryLogs.map((l, i) => (
                  <div key={i} className={l.includes('PASS') ? 'text-green-400 font-semibold' : 'text-gray-400'}>{l}</div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {result && !healable && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 pt-2 border-t border-gray-800">
            <p className="text-xs text-gray-400 leading-relaxed">{result.reasoning}</p>
            <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
              <span className="text-sm font-semibold text-orange-400">{result.status}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
