import { useEffect, useRef, useState } from 'react';

/**
 * RevenueWaterfall - an SVG waterfall chart that builds value step by step. Each
 * positive step stacks on the running total; the final step renders as the full
 * total bar. Bars grow in when scrolled into view. Pure SVG + CSS, no deps.
 */
export type WaterfallStep = { label: string; value: number };
export type RevenueWaterfallProps = {
  steps?: WaterfallStep[];
  prefix?: string;
  title?: string;
};

const DEFAULT_STEPS: WaterfallStep[] = [
  { label: 'Base bookings', value: 42000 },
  { label: 'Preferred vendors', value: 18000 },
  { label: 'Sponsorships', value: 24000 },
  { label: 'Upsell packages', value: 11000 },
];

function fmt(n: number, prefix: string): string {
  return prefix + Math.round(n).toLocaleString('en-US');
}

export default function RevenueWaterfall({
  steps = DEFAULT_STEPS,
  prefix = '$',
  title,
}: RevenueWaterfallProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [grow, setGrow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setGrow(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const total = steps.reduce((s, x) => s + x.value, 0);
  const all = [...steps, { label: 'Total', value: total }];
  const W = 600;
  const H = 280;
  const padX = 20;
  const padTop = 20;
  const padBottom = 46;
  const plotH = H - padTop - padBottom;
  const max = Math.max(total, 1);
  const barW = (W - padX * 2) / all.length - 16;
  const slot = (W - padX * 2) / all.length;

  let running = 0;

  return (
    <div className="mk-waterfall" ref={ref}>
      {title ? <div className="mk-feed-h">{title}</div> : null}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Revenue waterfall">
        {all.map((step, i) => {
          const isTotal = i === all.length - 1;
          const barH = (step.value / max) * plotH;
          const base = isTotal ? 0 : running;
          const baseH = (base / max) * plotH;
          const x = padX + i * slot + (slot - barW) / 2;
          const fullY = padTop + plotH - baseH - barH;
          const y = grow ? fullY : padTop + plotH;
          const h = grow ? barH : 0;
          if (!isTotal) running += step.value;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={5}
                fill={isTotal ? '#123c2e' : '#1E5D4A'}
                opacity={isTotal ? 1 : 0.92}
                style={{ transition: 'y .8s ease, height .8s ease', transitionDelay: `${i * 0.12}s` }}
              />
              <text x={x + barW / 2} y={fullY - 6} textAnchor="middle" className="mk-wf-val">
                {fmt(step.value, prefix)}
              </text>
              <text x={x + barW / 2} y={H - 24} textAnchor="middle" className="mk-wf-lbl">
                {step.label.length > 14 ? step.label.slice(0, 13) + '…' : step.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
