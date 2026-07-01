import { useEffect, useRef, useState } from 'react';

/**
 * AnimatedCounter - counts a number up from zero to its target value the first
 * time it scrolls into view. Pure React + requestAnimationFrame, no deps. Brand
 * styled. Drop it in with just a value; everything else is optional.
 */
export type AnimatedCounterProps = {
  value?: number;
  label?: string;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
};

function format(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export default function AnimatedCounter({
  value = 1240,
  label,
  prefix = '',
  suffix = '',
  durationMs = 1600,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(0);
  const [started, setStarted] = useState(false);

  // Trigger once when scrolled into view.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Run the count-up.
  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / Math.max(1, durationMs));
      // ease-out cubic for a premium settle
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, value, durationMs]);

  return (
    <div className="mk-counter" ref={ref}>
      <div className="mk-v">
        {prefix}
        {format(shown)}
        {suffix}
      </div>
      {label ? <div className="mk-l">{label}</div> : null}
    </div>
  );
}
