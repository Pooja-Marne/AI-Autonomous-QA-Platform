import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

const TONE_DOT = {
  info: 'bg-blue-500',
  fail: 'bg-red-500',
  ai: 'bg-purple-500',
  pass: 'bg-green-500',
  warn: 'bg-orange-500',
};

export default function AITimeline({ events, count }) {
  const visible = events.slice(0, count);
  return (
    <div className="space-y-0">
      <AnimatePresence initial={false}>
        {visible.map((e, i) => (
          <motion.div
            key={e.time + e.label}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="flex gap-3"
          >
            <div className="flex flex-col items-center">
              <span className={clsx('w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1', TONE_DOT[e.tone])} />
              {i < visible.length - 1 && <span className="w-px flex-1 bg-gray-800 my-1" />}
            </div>
            <div className="pb-4">
              <span className="text-xs font-mono text-gray-500">{e.time}</span>
              <p className="text-sm text-gray-200">{e.label}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
