import React, { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

// Intelligence Moat - Feature 12 Divini Score. A small, reusable badge that
// shows an entity's proprietary 0-100 Divini Score, an optional grade ring, and
// (when expanded) the per-factor component breakdown that produced it.
//
// Two ways to use it:
//   1. Controlled: pass `score` and optionally `components`. Pure render, no
//      network. Use this on lists/dashboards where the parent already fetched
//      the score (e.g. the DiviniScores overview page maps rows to badges).
//   2. Self-fetching: pass `entityType` + `entityId`. The component calls
//      /api/divini-score/:entityType/:entityId and renders the result.
//
// entityType is one of venue | vendor | planner | sponsor | client.

export type DiviniEntityType = 'venue' | 'vendor' | 'planner' | 'sponsor' | 'client';

export type DiviniFactor = {
  key: string;
  label: string;
  weight: number;
  earned: number;
};

export type DiviniComponents = {
  entity_type?: string;
  factors?: DiviniFactor[];
};

export type DiviniScoreBadgeProps = {
  /** Entity type (required for self-fetching; informational when controlled). */
  entityType?: DiviniEntityType;
  /** Entity id. When given WITHOUT a `score`, the badge self-fetches. */
  entityId?: string;
  /** Controlled score (0-100). Takes precedence over self-fetching. */
  score?: number | null;
  /** Controlled component breakdown to show when expanded. */
  components?: DiviniComponents | null;
  /** Show the per-factor breakdown under the badge. */
  showBreakdown?: boolean;
  /** Tighter layout for dense list rows. */
  compact?: boolean;
  /** Heading text. Defaults to "Divini Score". */
  label?: string;
  /** Optional className passthrough for the wrapper. */
  className?: string;
};

type ScoreResponse = {
  entity_type?: string;
  entity_id?: string;
  score?: number | null;
  components?: DiviniComponents | null;
};

function scoreTone(score: number): 'high' | 'mid' | 'low' {
  if (score >= 85) return 'high';
  if (score >= 60) return 'mid';
  return 'low';
}

function scoreGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

export default function DiviniScoreBadge({
  entityType,
  entityId,
  score,
  components,
  showBreakdown = false,
  compact = false,
  label = 'Divini Score',
  className,
}: DiviniScoreBadgeProps) {
  const controlled = typeof score === 'number';
  const [liveScore, setLiveScore] = useState<number | null>(
    controlled ? (score as number) : null,
  );
  const [liveComponents, setLiveComponents] = useState<DiviniComponents | null>(
    components ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep controlled props in sync.
  useEffect(() => {
    if (controlled) setLiveScore(score as number);
  }, [controlled, score]);
  useEffect(() => {
    if (components !== undefined) setLiveComponents(components ?? null);
  }, [components]);

  // Self-fetching mode: only when not controlled and both ids are present.
  useEffect(() => {
    if (controlled || !entityType || !entityId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    apiGet<ScoreResponse>(`/divini-score/${entityType}/${entityId}`)
      .then((res) => {
        if (!alive) return;
        setLiveScore(typeof res.score === 'number' ? res.score : null);
        setLiveComponents(res.components ?? null);
      })
      .catch((e) => {
        if (alive) setError((e as Error).message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [controlled, entityType, entityId]);

  if (loading && liveScore == null) {
    return (
      <div className={`ds ${compact ? 'ds-compact' : ''} ${className ?? ''}`}>
        <style>{CSS}</style>
        <span className="ds-muted">Loading score.</span>
      </div>
    );
  }

  if (error && liveScore == null) {
    return (
      <div className={`ds ${compact ? 'ds-compact' : ''} ${className ?? ''}`}>
        <style>{CSS}</style>
        <span className="ds-muted">Score unavailable.</span>
      </div>
    );
  }

  if (liveScore == null) return null;

  const value = Math.round(liveScore);
  const tone = scoreTone(value);
  const factors = liveComponents?.factors ?? [];

  return (
    <div className={`ds ds-${tone} ${compact ? 'ds-compact' : ''} ${className ?? ''}`}>
      <style>{CSS}</style>
      <div className="ds-badge" title={`${label}: ${value}/100`}>
        <span className="ds-grade" aria-hidden="true">{scoreGrade(value)}</span>
        <span className="ds-num">{value}</span>
        <span className="ds-of">/100</span>
        <span className="ds-cap">{label}</span>
      </div>
      {showBreakdown && factors.length > 0 && (
        <ul className="ds-list">
          {factors.map((f) => {
            const pct = f.weight > 0 ? Math.round((f.earned / f.weight) * 100) : 0;
            return (
              <li key={f.key} className="ds-row">
                <span className="ds-row-label">{f.label}</span>
                <span className="ds-bar" aria-hidden="true">
                  <span className="ds-bar-fill" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
                </span>
                <span className="ds-row-val">
                  {Math.round(f.earned)}<span className="ds-row-wt">/{f.weight}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const CSS = `
.ds { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); display:inline-block; }
.ds *,.ds *::before,.ds *::after { box-sizing:border-box; }
.ds-muted { font-size:12px; color:var(--mut); }
.ds-badge { display:inline-flex; align-items:baseline; gap:5px; padding:5px 12px; border-radius:999px;
  line-height:1.1; font-weight:800; border:1px solid var(--ln); }
.ds-grade { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px;
  border-radius:50%; font-size:11px; font-weight:900; align-self:center; }
.ds-num { font-size:18px; font-weight:900; }
.ds-of { font-size:10px; font-weight:600; opacity:.65; }
.ds-cap { font-size:9px; letter-spacing:.7px; text-transform:uppercase; font-weight:700;
  margin-left:5px; opacity:.85; align-self:center; }
.ds-high .ds-badge { background:rgba(30,93,74,.12); color:var(--e2); border-color:rgba(30,93,74,.25); }
.ds-high .ds-grade { background:var(--e2); color:#fff; }
.ds-mid .ds-badge { background:rgba(201,163,91,.20); color:#7a5a17; border-color:rgba(201,163,91,.4); }
.ds-mid .ds-grade { background:var(--g); color:#3a2c08; }
.ds-low .ds-badge { background:rgba(154,58,40,.12); color:#9a3a28; border-color:rgba(154,58,40,.3); }
.ds-low .ds-grade { background:#9a3a28; color:#fff; }
.ds-list { list-style:none; margin:10px 0 0; padding:0; display:flex; flex-direction:column; gap:6px;
  min-width:240px; }
.ds-row { display:flex; align-items:center; gap:8px; font-size:12px; }
.ds-row-label { flex:0 0 130px; color:var(--ink); }
.ds-bar { flex:1; height:6px; background:rgba(247,244,238,.9); border:1px solid var(--ln);
  border-radius:999px; overflow:hidden; }
.ds-bar-fill { display:block; height:100%; background:var(--e2); border-radius:999px; }
.ds-row-val { flex:0 0 auto; font-weight:700; color:var(--ink); font-size:11.5px; }
.ds-row-wt { font-weight:600; opacity:.6; }
.ds-compact .ds-badge { padding:3px 9px; }
.ds-compact .ds-num { font-size:15px; }
.ds-compact .ds-grade { width:15px; height:15px; font-size:9.5px; }
.ds-compact .ds-cap { font-size:8px; }
`;
