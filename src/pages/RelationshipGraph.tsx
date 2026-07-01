import React, { useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Intelligence Moat addendum - F5 Relationship Intelligence Graph.
 *
 * Enter an entity (type + id) and see its neighbors as a dependency-light SVG
 * node/edge view, plus the derived insight strings ("planner worked with venue
 * 14 times"). A Rebuild button recomputes the acting org's edges from existing
 * data. No charting library is used (none is in package.json); nodes are placed
 * on a circle around the center and edges drawn as plain SVG lines.
 *
 * Route wiring (src/App.tsx) is owned by the lead and not edited here.
 */

type GraphNode = { type: string; id: string; label: string };
type GraphEdge = {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  edge_type: string;
  weight: number;
  revenue: number;
  last_at: string | null;
};
type GraphResult = {
  center: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  insights: string[];
};

const ENTITY_TYPES = [
  'venue', 'vendor', 'planner', 'client', 'sponsor', 'organization', 'agency', 'brand', 'contact',
];

const EDGE_COLOR: Record<string, string> = {
  worked_together: '#1E5D4A',
  preferred: '#C9A35B',
  sponsor_history: '#8a6d3b',
  revenue: '#2d7d5a',
  collaboration: '#5a7d8a',
  partnership: '#7d5a8a',
  referred_by: '#a35b5b',
  past_projects: '#5b6ba3',
  introduction: '#909090',
};

const TYPE_FILL: Record<string, string> = {
  venue: '#1E5D4A',
  vendor: '#C9A35B',
  planner: '#5a7d8a',
  client: '#7d5a8a',
  sponsor: '#8a6d3b',
  organization: '#444',
  agency: '#5b6ba3',
  brand: '#a35b5b',
  contact: '#909090',
};

function color(map: Record<string, string>, key: string): string {
  return map[key] ?? '#777';
}

function GraphCanvas({ data }: { data: GraphResult }) {
  const W = 680;
  const H = 460;
  const cx = W / 2;
  const cy = H / 2;
  const R = 165;

  const neighbors = data.nodes.filter(
    (n) => !(n.type === data.center.type && n.id === data.center.id),
  );
  const pos = new Map<string, { x: number; y: number }>();
  pos.set(`${data.center.type}:${data.center.id}`, { x: cx, y: cy });
  neighbors.forEach((n, i) => {
    const ang = (2 * Math.PI * i) / Math.max(1, neighbors.length) - Math.PI / 2;
    pos.set(`${n.type}:${n.id}`, { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang) });
  });

  const at = (type: string, id: string) => pos.get(`${type}:${id}`) ?? { x: cx, y: cy };
  const maxW = Math.max(1, ...data.edges.map((e) => e.weight));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ maxWidth: W, display: 'block', margin: '0 auto' }}
      role="img"
      aria-label="Relationship graph"
    >
      {data.edges.map((e, i) => {
        const a = at(e.from_type, e.from_id);
        const b = at(e.to_type, e.to_id);
        const stroke = color(EDGE_COLOR, e.edge_type);
        const sw = 1 + (e.weight / maxW) * 4;
        return (
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={sw} strokeOpacity={0.55} />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 3}
              fontSize={10}
              textAnchor="middle"
              fill={stroke}
            >
              {e.edge_type.replace(/_/g, ' ')}
              {e.weight > 1 ? ` ×${e.weight}` : ''}
            </text>
          </g>
        );
      })}
      {data.nodes.map((n) => {
        const p = at(n.type, n.id);
        const isCenter = n.type === data.center.type && n.id === data.center.id;
        const r = isCenter ? 30 : 22;
        return (
          <g key={`${n.type}:${n.id}`}>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={color(TYPE_FILL, n.type)}
              stroke={isCenter ? '#000' : '#fff'}
              strokeWidth={isCenter ? 2 : 1.5}
            />
            <text x={p.x} y={p.y + 4} fontSize={10} textAnchor="middle" fill="#fff" fontWeight={700}>
              {n.type}
            </text>
            <text x={p.x} y={p.y + r + 13} fontSize={11} textAnchor="middle" fill="#333">
              {(n.label || n.type).slice(0, 22)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function RelationshipGraph() {
  const [type, setType] = useState('venue');
  const [id, setId] = useState('');
  const [data, setData] = useState<GraphResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!id.trim()) {
      setErr('Enter an entity id');
      return;
    }
    setLoading(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await apiGet<GraphResult>(
        `/relationship/graph?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id.trim())}`,
      );
      setData(r);
    } catch (e) {
      setErr((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function rebuild() {
    setRebuilding(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await apiSend<{ rebuilt: boolean; edges: number }>('POST', '/relationship/rebuild');
      setMsg(`Recomputed ${r.edges} relationship edge${r.edges === 1 ? '' : 's'} from your data.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRebuilding(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Relationship Graph</h1>
          <div className="sub">Who has worked with whom, derived from your events, quotes, and partnerships</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid cards2" style={{ gap: 12 }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Entity type</div>
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: '100%' }}>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Entity id</div>
            <input
              value={id}
              onChange={(e) => setId(e.target.value)}
              style={{ width: '100%' }}
              placeholder="uuid"
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" onClick={load} disabled={loading}>
            {loading ? 'Loading...' : 'View graph'}
          </button>
          <button className="btn" onClick={rebuild} disabled={rebuilding}>
            {rebuilding ? 'Rebuilding...' : 'Rebuild edges'}
          </button>
        </div>
        <p className="note" style={{ margin: '12px 0 0', lineHeight: 1.6 }}>
          Edges are derived deterministically from existing data: shared events
          and event vendors (worked together), preferred-vendor links, sponsorship
          history, and quotes / invoices (revenue). Rebuild recomputes your org's
          graph from the current data.
        </p>
      </div>

      {msg && (
        <div className="card" style={{ borderColor: '#1E5D4A', color: '#1E5D4A', marginBottom: 16 }}>{msg}</div>
      )}
      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>
      )}

      {data && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="sectitle" style={{ marginBottom: 6 }}>
              {data.center.label || data.center.type}
            </div>
            {data.edges.length === 0 ? (
              <p className="note" style={{ margin: 0 }}>
                No relationships found for this entity yet. Try Rebuild edges, or pick another entity.
              </p>
            ) : (
              <GraphCanvas data={data} />
            )}
          </div>

          {data.insights.length > 0 && (
            <>
              <div className="sectitle" style={{ marginBottom: 10 }}>Insights</div>
              <div className="card">
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, lineHeight: 1.9 }}>
                  {data.insights.map((s, i) => (
                    <li key={i} className="note" style={{ paddingLeft: 16, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: '#C9A35B', fontWeight: 700 }}>·</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
