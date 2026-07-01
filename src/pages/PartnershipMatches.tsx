import React, { useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * Intelligence Moat addendum - F6 Partnership Matching Engine.
 *
 * Pick a source entity (type + id) and a target kind, get back deterministically
 * ranked match cards with a 0..100 score and the reasons behind it (location,
 * budget, audience, capacity, capabilities, historical success, industry,
 * availability, revenue, relationship strength). Uses src/lib/api.ts; no charting
 * dependency. Route wiring (src/App.tsx) is owned by the lead.
 */

type MatchEntity = {
  id: string;
  kind: string;
  name?: string | null;
  category?: string | null;
  city?: string | null;
  region?: string | null;
};
type MatchComponent = {
  key: 'fit' | 'divini_score' | 'business_health';
  label: string;
  weight: number;
  value: number;
  contribution: number;
};
type Match = {
  candidate: MatchEntity;
  score: number;
  fit?: number;
  reasons: string[];
  components?: MatchComponent[];
};
type MatchResult = {
  source: { type: string; id: string; name: string | null; kind: string };
  targetKind: string;
  matches: Match[];
};

const SOURCE_TYPES = ['venue', 'vendor', 'planner', 'agency', 'sponsor', 'brand', 'client'];
const TARGET_KINDS = ['vendor', 'sponsor', 'client', 'venue'];

function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ height: 6, background: '#e7e1d6', borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, score))}%`, height: '100%', background: '#1E5D4A' }} />
    </div>
  );
}

function MatchCard({ m }: { m: Match }) {
  const c = m.candidate;
  const title = c.name || c.category || c.kind;
  const sub = [c.category, c.city, c.region].filter(Boolean).join(' · ');
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        <span style={{ fontWeight: 700, color: '#C9A35B', fontSize: 20 }}>{m.score}</span>
      </div>
      {sub && <div className="note" style={{ marginTop: 2 }}>{sub}</div>}
      <ScoreBar score={m.score} />
      {m.components && m.components.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="note" style={{ marginBottom: 4, fontWeight: 600 }}>Why this match</div>
          {m.components.map((cp) => (
            <div
              key={cp.key}
              className="note"
              style={{ display: 'flex', justifyContent: 'space-between', gap: 8, lineHeight: 1.6 }}
            >
              <span>
                {cp.label} <span style={{ opacity: 0.6 }}>({Math.round(cp.weight * 100)}% &times; {cp.value})</span>
              </span>
              <span style={{ fontWeight: 700, color: '#1E5D4A' }}>+{Math.round(cp.contribution)}</span>
            </div>
          ))}
        </div>
      )}
      {m.reasons.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, lineHeight: 1.7 }}>
          {m.reasons.slice(0, 6).map((r, i) => (
            <li key={i} className="note" style={{ paddingLeft: 14, position: 'relative' }}>
              <span style={{ position: 'absolute', left: 0, color: '#C9A35B', fontWeight: 700 }}>+</span>
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PartnershipMatches() {
  const [type, setType] = useState('venue');
  const [id, setId] = useState('');
  const [kind, setKind] = useState('vendor');
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!id.trim()) {
      setErr('Enter a source entity id');
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<MatchResult>(
        `/partnership-match?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id.trim())}&kind=${encodeURIComponent(kind)}`,
      );
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Partnership Matches</h1>
          <div className="sub">Ranked partners: fit blended with each partner's Divini Score and business health</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid cards2" style={{ gap: 12 }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Source type</div>
            <select value={type} onChange={(e) => setType(e.target.value)} style={{ width: '100%' }}>
              {SOURCE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Source id</div>
            <input value={id} onChange={(e) => setId(e.target.value)} style={{ width: '100%' }} placeholder="uuid" />
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Match against</div>
            <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: '100%' }}>
              {TARGET_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" onClick={run} disabled={loading}>
            {loading ? 'Matching...' : 'Find matches'}
          </button>
        </div>
        <p className="note" style={{ margin: '12px 0 0', lineHeight: 1.6 }}>
          Matches are scored deterministically across location, budget, audience,
          capacity, capabilities, historical success, industry, availability,
          revenue, and existing relationship strength.
        </p>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>
      )}

      {result && (
        <>
          <div className="sectitle" style={{ marginBottom: 10 }}>
            {result.matches.length} match{result.matches.length === 1 ? '' : 'es'}
            {result.source.name ? ` for ${result.source.name}` : ''}
          </div>
          {result.matches.length === 0 ? (
            <div className="card"><p className="note" style={{ margin: 0 }}>No matches found.</p></div>
          ) : (
            <div className="grid cards2" style={{ gap: 12 }}>
              {result.matches.map((m) => (
                <MatchCard key={`${m.candidate.kind}:${m.candidate.id}`} m={m} />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
