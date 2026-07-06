import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const lineColor = (line) => {
  if (line.startsWith('  ✓') || line.includes('PASS')) return 'text-green-400';
  if (line.startsWith('  ✗') || /locator not found|element hidden|http 500/i.test(line)) return 'text-red-400';
  if (/screenshot|trace saved/i.test(line)) return 'text-yellow-400';
  if (/healing|retrying|applying/i.test(line)) return 'text-purple-400';
  return 'text-gray-400';
};

/** Terminal-style auto-scrolling log console with a blinking cursor. */
export default function LogConsole({ lines, height = 'h-48', active = true }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  return (
    <div className={`bg-black/60 border border-gray-800 rounded-xl p-3 font-mono text-xs overflow-y-auto ${height}`}>
      <AnimatePresence initial={false}>
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className={lineColor(line)}
          >
            <span className="text-gray-600 mr-2">$</span>{line}
          </motion.div>
        ))}
      </AnimatePresence>
      {active && (
        <span className="inline-block w-2 h-3.5 bg-green-500 animate-pulse ml-4 align-middle" />
      )}
      <div ref={bottomRef} />
    </div>
  );
}
