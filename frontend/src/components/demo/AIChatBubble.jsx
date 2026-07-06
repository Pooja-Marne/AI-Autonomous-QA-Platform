import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

/** Chat-style bubble that types out the AI's reasoning character by character. */
export default function AIChatBubble({ text, speed = 12 }) {
  const [shown, setShown] = useState('');

  useEffect(() => {
    setShown('');
    let i = 0;
    const id = setInterval(() => {
      i += 3;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  const done = shown.length >= text.length;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Sparkles className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="bg-gray-800/80 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-gray-200 leading-relaxed max-w-xl">
        {shown}
        {!done && <span className="inline-block w-1.5 h-3.5 bg-purple-400 animate-pulse ml-0.5 align-middle" />}
      </div>
    </motion.div>
  );
}
