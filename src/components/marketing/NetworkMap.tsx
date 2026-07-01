import { useEffect, useRef, useState } from 'react';

/**
 * NetworkMap - an SVG relationship cluster. A central account links out to a
 * ring of related partners; lines fade in and a soft pulse travels each edge
 * when scrolled into view. Deterministic layout, no data calls. Pure SVG, no
 * deps. Simpler sibling of EcosystemGraph for relationship-focused sections.
 */
export type NetworkMapNode = { label: string; tag?: string };
export type NetworkMapProps = {
  center?: string;
  nodes?: NetworkMapNode[];
  title?: string;
};

const DEFAULT_NODES: NetworkMapNode[] = [
  { label: 'Maison Catering', tag: 'Catering' },
  { label: 'Lumiere AV', tag: 'Production' },
  { label: 'Petal & Stem', tag: 'Floral' },
  { label: 'Crescendo', tag: 'Music' },
  { label: 'Northbeam', tag: 'Sponsor' },
  { label: 'Atlas Rentals', tag: 'Supplier' },
];

export default function NetworkMap({
  center = 'Your Venue',
  nodes = DEFAULT_NODES,
  title,
}: NetworkMapProps) {
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

  const W = 600;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const radius = 132;
  const count = Math.max(1, nodes.length);

  const placed = nodes.map((n, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });

  return (
    <div className="mk-graph" ref={ref}>
      {title ? <div className="mk-feed-h">{title}</div> : null}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Relationship network map">
        <defs>
          <linearGradient id="mk-nm-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1E5D4A" />
            <stop offset="100%" stopColor="#D9CCB0" />
          </linearGradient>
          <radialGradient id="mk-nm-center" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#1E5D4A" />
            <stop offset="100%" stopColor="#123c2e" />
          </radialGradient>
        </defs>

        {placed.map((n, i) => (
          <g key={n.label}>
            <line
              x1={cx}
              y1={cy}
              x2={n.x}
              y2={n.y}
              stroke="url(#mk-nm-line)"
              strokeWidth={1.8}
              opacity={live ? 0.55 : 0.18}
              style={{ transition: 'opacity .9s ease', transitionDelay: `${i * 0.08}s` }}
            />
            {live ? (
              <circle r={3.5} fill="#D9CCB0">
                <animateMotion dur={`${2.6 + i * 0.3}s`} repeatCount="indefinite" path={`M${cx},${cy} L${n.x},${n.y}`} />
              </circle>
            ) : null}
            <circle cx={n.x} cy={n.y} r={30} fill="#fff" stroke="#1E5D4A" strokeWidth={1.8} />
            <text x={n.x} y={n.y - 1} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#123c2e" fontFamily="Inter, sans-serif">
              {n.label.length > 12 ? n.label.slice(0, 11) + '…' : n.label}
            </text>
            {n.tag ? (
              <text x={n.x} y={n.y + 10} textAnchor="middle" fontSize="8" fill="#7d776c" fontFamily="Inter, sans-serif">
                {n.tag}
              </text>
            ) : null}
          </g>
        ))}

        <circle cx={cx} cy={cy} r={46} fill="url(#mk-nm-center)" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="13" fontWeight="700" fill="#D9CCB0" fontFamily="Inter, sans-serif">
          {center}
        </text>
      </svg>
    </div>
  );
}
