import { useEffect, useState } from 'react';
import { animate } from 'framer-motion';

/** Counts up from 0 to `value` whenever `value`/`trigger` changes. */
export default function AnimatedCounter({ value, suffix = '', duration = 1.2, trigger }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const controls = animate(0, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, trigger]);

  return <span>{display}{suffix}</span>;
}
