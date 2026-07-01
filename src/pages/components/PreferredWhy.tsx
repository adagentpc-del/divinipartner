import React, { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

// Friction Elimination - U11 Transparent Preferred Vendor. A small, reusable
// presentational component that answers "WHY is this vendor preferred?" with a
// short list of proof reasons (e.g. "83 completed projects", "4.9 average
// rating", "98% on-time") and an optional Vendor Compliance Score badge.
//
// Two ways to use it:
//   1. Controlled: pass `why` (string[]) and optionally `score` (0-100). Pure
//      render, no network. Use this on preferred-vendor lists where the parent
//      already has the reasons in hand.
//   2. Self-fetching: pass `vendorId`. The component calls
//      /api/vendor-compliance/:vendorId and renders the returned why + score.
//
// The integration lead will surface (1) on the preferred-vendor list rows
// (PreferredVendors.tsx): map each row's vendor to its reasons and render
// <PreferredWhy why={reasons} score={score} compact />.

export type PreferredWhyProps = {
  /** Pre-computed reasons (controlled mode). Takes precedence over vendorId. */
  why?: string[];
  /** Optional compliance score (0-100) to show as a badge. */
  score?: number | null;
  /** Self-fetching mode: load why + score from /api/vendor-compliance/:vendorId. */
  vendorId?: string;
  /** Tighter layout for dense list rows. */
  compact?: boolean;
  /** Heading text. Defaults to "Preferred because". */
  label?: string;
  /** Hide the score badge even when a score is available. */
  hideScore?: boolean;
  /** Optional className passthrough for the wrapper. */
  className?: string;
};

type ComplianceResponse = { score?: number | null; why?: string[] };

function scoreTone(score: number): 'high' | 'mid' | 'low' {
  if (score >= 85) return 'high';
  if (score >= 60) return 'mid';
  return 'low';
}

export default function PreferredWhy({
  why,
  score,
  vendorId,
  compact = false,
  label = 'Preferred because',
  hideScore = false,
  className,
}: PreferredWhyProps) {
  const controlled = Array.isArray(why);
  const [reasons, setReasons] = useState<string[]>(controlled ? (why as string[]) : []);
  const [liveScore, setLiveScore] = useState<number | null>(
    typeof score === 'number' ? score : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep controlled props in sync.
  useEffect(() => {
    if (controlled) setReasons(why as string[]);
  }, [controlled, why]);
  useEffect(() => {
    if (typeof score === 'number') setLiveScore(score);
  }, [score]);

  // Self-fetching mode: only when not controlled and a vendorId is given.
  useEffect(() => {
    if (controlled || !vendorId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    apiGet<ComplianceResponse>(`/vendor-compliance/${vendorId}`)
      .then((res) => {
        if (!alive) return;
        setReasons(res.why || []);
        setLiveScore(typeof res.score === 'number' ? res.score : null);
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
  }, [controlled, vendorId]);

  const showScore = !hideScore && typeof liveScore === 'number';

  if (loading && reasons.length === 0 && !showScore) {
    return (
      <div className={`pw ${compact ? 'pw-compact' : ''} ${className ?? ''}`}>
        <style>{CSS}</style>
        <span className="pw-muted">Loading reasons.</span>
      </div>
    );
  }

  if (error && reasons.length === 0 && !showScore) {
    return (
      <div className={`pw ${compact ? 'pw-compact' : ''} ${className ?? ''}`}>
        <style>{CSS}</style>
        <span className="pw-muted">Reasons unavailable.</span>
      </div>
    );
  }

  if (reasons.length === 0 && !showScore) return null;

  return (
    <div className={`pw ${compact ? 'pw-compact' : ''} ${className ?? ''}`}>
      <style>{CSS}</style>
      <div className="pw-head">
        <span className="pw-label">{label}</span>
        {showScore && (
          <span className={`pw-score pw-${scoreTone(liveScore as number)}`}>
            {Math.round(liveScore as number)}<span className="pw-score-max">/100</span>
            <span className="pw-score-cap">compliance</span>
          </span>
        )}
      </div>
      {reasons.length > 0 && (
        <ul className="pw-list">
          {reasons.map((r, i) => (
            <li key={`${i}-${r}`} className="pw-reason">
              <span className="pw-check" aria-hidden="true">&#10003;</span>
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const CSS = `
.pw { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); }
.pw *,.pw *::before,.pw *::after { box-sizing:border-box; }
.pw-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:6px; }
.pw-label { font-size:10.5px; letter-spacing:1px; text-transform:uppercase; color:var(--g); font-weight:700; }
.pw-muted { font-size:12px; color:var(--mut); }
.pw-score { display:inline-flex; align-items:baseline; gap:3px; font-size:13px; font-weight:800;
  padding:2px 9px; border-radius:999px; line-height:1.2; }
.pw-score-max { font-size:10px; font-weight:600; opacity:.7; }
.pw-score-cap { font-size:9px; letter-spacing:.6px; text-transform:uppercase; font-weight:700; margin-left:4px; opacity:.85; }
.pw-high { background:rgba(30,93,74,.14); color:var(--e2); }
.pw-mid { background:rgba(201,163,91,.22); color:#7a5a17; }
.pw-low { background:rgba(154,58,40,.12); color:#9a3a28; }
.pw-list { list-style:none; margin:0; padding:0; display:flex; flex-wrap:wrap; gap:6px 10px; }
.pw-reason { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--ink);
  background:rgba(247,244,238,.85); border:1px solid var(--ln); border-radius:999px; padding:3px 11px; }
.pw-check { color:var(--e2); font-weight:800; font-size:11px; }
.pw-compact .pw-label { font-size:9.5px; }
.pw-compact .pw-reason { font-size:11.5px; padding:2px 9px; }
.pw-compact .pw-score { font-size:12px; padding:1px 8px; }
`;
