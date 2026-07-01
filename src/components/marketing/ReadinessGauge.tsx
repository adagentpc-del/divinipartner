import { useEffect, useRef, useState } from 'react';

/**
 * ReadinessGauge - an SVG ring/arc gauge that sweeps to its score when scrolled
 * into view. Brand styled (emerald arc on a champagne track), with the numeric
 * value in the center. Pure SVG + requestAnimationFrame, no deps.
 */
export type ReadinessGaugeProps = {
  score?: number; // 0..100
  label?: string;
  size?: number;
};

export default function ReadinessGauge({
  score = 82,
  label = 'Event Readiness',
  size = 180,
}: ReadinessGaugeProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(0);
  const [started, setStarted] = useState(false);

  const clamped = Math.max(0, Math.min(100, score));
  const r = (size - 24) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  // Use 75% of the circle as a sweep (270deg arc), starting from bottom-left.
  const arcFraction = 0.75;
  const arcLen = circ * arcFraction;
  const dash = (shown / 100) * arcLen;

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

  useEffect(() => {
    if (!started) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1400;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(clamped * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, clamped]);

  // rotate so the 270deg arc opening sits at the bottom
  const rotate = `rotate(135 ${cx} ${cy})`;

  return (
    <div className="mk-gauge" ref={ref}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${Math.round(clamped)}`}>
        <g transform={rotate}>
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#e7e1d6"
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${arcLen} ${circ}`}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#1E5D4A"
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circ}`}
          />
        </g>
        <text x={cx} y={cy + 4} textAnchor="middle" className="mk-gv">
          {Math.round(shown)}
        </text>
      </svg>
      {label ? <div className="mk-gl">{label}</div> : null}
    </div>
  );
}
