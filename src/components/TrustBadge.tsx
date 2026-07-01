import React from 'react';

// Phase 7 - Reusable trust-score badge (blueprint 27.3). Renders a 0..100 trust
// score with a band color and an optional label. Self-contained styles, Divini
// Partners palette. No required props beyond `score`.

type Band = 'new' | 'building' | 'established' | 'trusted' | 'elite';

function bandFor(score: number): { band: Band; text: string } {
  if (score >= 90) return { band: 'elite', text: 'Elite' };
  if (score >= 78) return { band: 'trusted', text: 'Trusted' };
  if (score >= 60) return { band: 'established', text: 'Established' };
  if (score >= 40) return { band: 'building', text: 'Building' };
  return { band: 'new', text: 'New' };
}

export default function TrustBadge({
  score,
  label,
  size = 'md',
}: {
  score: number | null | undefined;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const has = score != null && Number.isFinite(Number(score));
  const value = has ? Math.round(Number(score)) : null;
  const { band, text } = bandFor(value ?? 0);

  return (
    <span className={`tb tb-${size} tb-${has ? band : 'unknown'}`} title={label ? `${label}: ${text}` : `Trust: ${text}`}>
      <style>{CSS}</style>
      <span className="tb-dot" aria-hidden="true" />
      <span className="tb-num">{has ? value : '--'}</span>
      <span className="tb-band">{has ? text : 'Unrated'}</span>
      {label && <span className="tb-label">{label}</span>}
    </span>
  );
}

const CSS = `
.tb { --e:#123c2e; --g:#C9A35B; --mut:#7d776c; --ln:#e7e1d6;
  display:inline-flex; align-items:center; gap:7px; font-family:'Inter',system-ui,sans-serif;
  border:1px solid var(--ln); border-radius:999px; background:#fff; padding:4px 11px; line-height:1; }
.tb-sm { padding:3px 9px; gap:5px; }
.tb-dot { width:8px; height:8px; border-radius:50%; flex:0 0 8px; background:var(--mut); }
.tb-num { font-family:'Cormorant Garamond',Georgia,serif; font-weight:700; font-size:16px; color:var(--e); }
.tb-sm .tb-num { font-size:14px; }
.tb-band { font-size:10.5px; letter-spacing:.6px; text-transform:uppercase; font-weight:600; color:var(--mut); }
.tb-label { font-size:11px; color:var(--mut); border-left:1px solid var(--ln); padding-left:7px; }
.tb-elite .tb-dot { background:linear-gradient(135deg,var(--g),#b58e44); }
.tb-elite .tb-band { color:#7a5e22; }
.tb-trusted .tb-dot { background:#1E5D4A; }
.tb-trusted .tb-band { color:#1E5D4A; }
.tb-established .tb-dot { background:#3f8d73; }
.tb-established .tb-band { color:#3f8d73; }
.tb-building .tb-dot { background:var(--g); }
.tb-building .tb-band { color:#8a6c2c; }
.tb-new .tb-dot { background:var(--mut); }
.tb-unknown .tb-num { color:var(--mut); }
`;
