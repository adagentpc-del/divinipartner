import { useEffect, useRef, useState } from 'react';
import AnimatedCounter from './AnimatedCounter';

/**
 * EcosystemGraph - an animated SVG network showing how Divini connects venues,
 * vendors, sponsors, events, and revenue. Connecting lines pulse with activity
 * and the center node glows. Deterministic (no random, no data calls). Optional
 * live-looking counters underneath. Pure SVG + CSS animation, no deps.
 */
export type EcosystemGraphProps = {
  showCounters?: boolean;
  counters?: { value: number; label: string; prefix?: string; suffix?: string }[];
  title?: string;
};

type Node = { id: string; label: string; x: number; y: number; r: number; center?: boolean };

const NODES: Node[] = [
  { id: 'events', label: 'Events', x: 300, y: 150, r: 40, center: true },
  { id: 'venues', label: 'Venues', x: 110, y: 70, r: 30 },
  { id: 'vendors', label: 'Vendors', x: 490, y: 70, r: 30 },
  { id: 'sponsors', label: 'Sponsors', x: 110, y: 232, r: 30 },
  { id: 'revenue', label: 'Revenue', x: 490, y: 232, r: 30 },
];

const DEFAULT_COUNTERS: NonNullable<EcosystemGraphProps['counters']> = [
  { value: 4820, label: 'Opportunities Created' },
  { value: 3160, label: 'Quotes Generated' },
  { value: 9400000, label: 'Revenue Created', prefix: '$' },
  { value: 1870, label: 'Vendor Matches' },
  { value: 640, label: 'Sponsorship Opportunities' },
];

export default function EcosystemGraph({
  showCounters = true,
  counters = DEFAULT_COUNTERS,
  title,
}: EcosystemGraphProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLive(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const center = NODES.find((n) => n.center)!;
  const spokes = NODES.filter((n) => !n.center);

  return (
    <div className="mk-graph" ref={ref}>
      {title ? <div className="mk-feed-h">{title}</div> : null}
      <svg viewBox="0 0 600 300" role="img" aria-label="Divini ecosystem network">
        <defs>
          <radialGradient id="mk-eg-center" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1E5D4A" />
            <stop offset="100%" stopColor="#123c2e" />
          </radialGradient>
          <linearGradient id="mk-eg-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1E5D4A" />
            <stop offset="100%" stopColor="#D9CCB0" />
          </linearGradient>
        </defs>

        {/* connecting lines + pulse */}
        {spokes.map((n, i) => (
          <g key={n.id}>
            <line
              x1={center.x}
              y1={center.y}
              x2={n.x}
              y2={n.y}
              stroke="url(#mk-eg-line)"
              strokeWidth={2}
              opacity={0.5}
            />
            {live ? (
              <circle r={4} fill="#D9CCB0">
                <animateMotion
                  dur={`${2.4 + i * 0.35}s`}
                  repeatCount="indefinite"
                  path={`M${center.x},${center.y} L${n.x},${n.y}`}
                />
              </circle>
            ) : null}
          </g>
        ))}

        {/* spoke nodes */}
        {spokes.map((n) => (
          <g key={n.id}>
            <circle cx={n.x} cy={n.y} r={n.r} fill="#fff" stroke="#1E5D4A" strokeWidth={2} />
            <text x={n.x} y={n.y + 4} textAnchor="middle" className="mk-node-lbl">
              {n.label}
            </text>
          </g>
        ))}

        {/* center node */}
        <circle cx={center.x} cy={center.y} r={center.r} fill="url(#mk-eg-center)">
          {live ? (
            <animate attributeName="r" values={`${center.r};${center.r + 4};${center.r}`} dur="2.6s" repeatCount="indefinite" />
          ) : null}
        </circle>
        <text x={center.x} y={center.y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#D9CCB0" fontFamily="Inter, sans-serif">
          {center.label}
        </text>
      </svg>

      {showCounters ? (
        <div className="mk-counters">
          {counters.map((c) => (
            <AnimatedCounter
              key={c.label}
              value={c.value}
              label={c.label}
              prefix={c.prefix}
              suffix={c.suffix}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
