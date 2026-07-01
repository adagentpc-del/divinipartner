import React, { useState } from 'react';
import { apiSend } from '../../lib/api';
import TrustBadge from '../../components/TrustBadge';

// Phase 7 - Vendor Recommendations (blueprint 26). Enter event criteria and get
// a deterministically ranked list of matched vendors with match reasons.
// Self-contained styles in the Divini Partners palette.

type Vendor = {
  id: string;
  organization_id: string;
  name?: string | null;
  category?: string | null;
  region?: string | null;
  city?: string | null;
  review_score?: number | null;
  trust_score?: number | null;
  preferred_status?: boolean | null;
  premier_status?: boolean | null;
  starred?: boolean;
};
type Match = { vendor: Vendor; score: number; reasons: string[] };

export default function Recommendations() {
  const [category, setCategory] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [budget, setBudget] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setLoading(true);
    setError(null);
    try {
      const r = await apiSend<{ matches: Match[] }>('POST', '/intelligence/recommendations', {
        criteria: {
          category: category || undefined,
          region: region || undefined,
          city: city || undefined,
          guest_count: guestCount ? Number(guestCount) : undefined,
          budget: budget ? Number(budget) : undefined,
        },
        limit: 24,
      });
      setMatches(r.matches || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function star(vendorOrgId: string) {
    try {
      await apiSend('POST', '/starred', { vendor_org_id: vendorOrgId });
      setMatches((m) => (m ? m.map((x) => (x.vendor.organization_id === vendorOrgId ? { ...x, vendor: { ...x.vendor, starred: true } } : x)) : m));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="rc">
      <style>{CSS}</style>

      <header className="rc-head">
        <div>
          <span className="rc-kicker">Event Intelligence</span>
          <h1 className="rc-title">Vendor Recommendations</h1>
          <p className="rc-sub">Match vendors to your event criteria, ranked by fit, trust, and your preferred list.</p>
        </div>
      </header>

      {error && <div className="rc-error">{error}</div>}

      <section className="rc-filters">
        <label>Category<input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="catering, florals, dj..." /></label>
        <label>Region<input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="region" /></label>
        <label>City<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="city" /></label>
        <label>Guests<input type="number" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} /></label>
        <label>Budget ($)<input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <button type="button" className="rc-btn" disabled={loading} onClick={search}>{loading ? 'Matching.' : 'Find vendors'}</button>
      </section>

      {matches == null ? (
        <div className="rc-empty">Enter criteria and run a match to see recommended vendors.</div>
      ) : matches.length === 0 ? (
        <div className="rc-empty">No vendors matched these criteria yet.</div>
      ) : (
        <div className="rc-list">
          {matches.map((m) => (
            <article key={m.vendor.id} className="rc-card">
              <div className="rc-card-top">
                <h3>{m.vendor.name ?? 'Vendor'}</h3>
                <span className="rc-score" title="Match score">{m.score}</span>
              </div>
              <p className="rc-meta">
                {m.vendor.category ?? 'vendor'}{m.vendor.city ? ` · ${m.vendor.city}` : ''}{m.vendor.region ? `, ${m.vendor.region}` : ''}
              </p>
              <div className="rc-badges">
                <TrustBadge score={m.vendor.trust_score} size="sm" />
                {m.vendor.starred && <span className="rc-tag starred">Starred</span>}
                {m.vendor.premier_status && <span className="rc-tag premier">Premier</span>}
              </div>
              {m.reasons.length > 0 && (
                <ul className="rc-reasons">
                  {m.reasons.slice(0, 4).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
              <div className="rc-actions">
                {!m.vendor.starred && (
                  <button type="button" className="rc-btn ghost sm" onClick={() => star(m.vendor.organization_id)}>Star partner</button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const CSS = `
.rc { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.rc *,.rc *::before,.rc *::after { box-sizing:border-box; }
.rc h1,.rc h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.rc-head { margin-bottom:18px; }
.rc-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.rc-title { font-size:28px; color:var(--e); line-height:1.1; }
.rc-sub { font-size:13px; color:var(--mut); margin:4px 0 0; }
.rc-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.rc-filters { display:grid; grid-template-columns:1.4fr 1fr 1fr .7fr .9fr auto; gap:10px; align-items:end; background:#fff; border:1px solid var(--ln); border-radius:14px; padding:16px; margin-bottom:20px; }
.rc-filters label { display:flex; flex-direction:column; gap:4px; font-size:11.5px; color:var(--mut); font-weight:600; }
.rc-filters input { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.rc-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 18px; cursor:pointer; height:38px; }
.rc-btn:hover { background:var(--e2); }
.rc-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.rc-btn.sm { padding:6px 13px; font-size:11.5px; height:auto; }
.rc-btn:disabled { opacity:.55; cursor:default; }
.rc-empty { padding:46px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.rc-list { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
.rc-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:8px; }
.rc-card-top { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; }
.rc-card h3 { font-size:19px; color:var(--e); }
.rc-score { font-family:'Cormorant Garamond',Georgia,serif; font-weight:700; font-size:24px; color:var(--g); line-height:1; }
.rc-meta { font-size:12px; color:var(--mut); margin:0; text-transform:capitalize; }
.rc-badges { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.rc-tag { font-size:10px; letter-spacing:.5px; text-transform:uppercase; font-weight:600; padding:2px 8px; border-radius:999px; }
.rc-tag.starred { background:rgba(201,163,91,.2); color:#7a5e22; }
.rc-tag.premier { background:rgba(30,93,74,.12); color:var(--e2); }
.rc-reasons { list-style:none; margin:4px 0 0; padding:0; display:flex; flex-direction:column; gap:3px; }
.rc-reasons li { font-size:11.5px; color:var(--mut); padding-left:13px; position:relative; }
.rc-reasons li::before { content:'+'; position:absolute; left:0; color:var(--g); font-weight:700; }
.rc-actions { margin-top:auto; }
@media (max-width:980px){ .rc-list { grid-template-columns:repeat(2,1fr); } .rc-filters { grid-template-columns:1fr 1fr; } }
@media (max-width:620px){ .rc-list { grid-template-columns:1fr; } }
`;
