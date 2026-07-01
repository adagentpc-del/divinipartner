import React, { useState } from 'react';
import { apiGet, apiSend } from '../lib/api';
import PreferredWhy from './components/PreferredWhy';

// Friction Elimination - U9 Vendor Compliance Score + U11 Transparent Preferred
// Vendor. A vendor (or their org admin) views and refreshes their compliance
// signals and score, and previews the "Preferred because" reasons venues will
// see across the marketplace. Reads/writes go through /api/vendor-compliance
// (org-scoped + IDOR-safe server side, so a forged vendor id from another tenant
// is rejected). The score (0-100) feeds marketplace ranking alongside the
// Phase-4 readiness score.

type Factor = { key: string; label: string; weight: number; earned: number };

type ComplianceResponse = {
  vendor_id: string;
  score: number;
  breakdown: Factor[];
  why: string[];
  row: Record<string, unknown> | null;
};

function scoreTone(score: number): 'high' | 'mid' | 'low' {
  if (score >= 85) return 'high';
  if (score >= 60) return 'mid';
  return 'low';
}

export default function VendorCompliancePanel() {
  const [vendorId, setVendorId] = useState('');
  const [activeVendor, setActiveVendor] = useState('');
  const [data, setData] = useState<ComplianceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ComplianceResponse>(`/vendor-compliance/${id}`);
      setData(res);
      setActiveVendor(id);
    } catch (e) {
      setError((e as Error).message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (!activeVendor) return;
    setRefreshing(true);
    setError(null);
    try {
      await apiSend('POST', `/vendor-compliance/${activeVendor}/recompute`);
      await load(activeVendor);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  const score = data?.score ?? 0;

  return (
    <div className="vc">
      <style>{CSS}</style>

      <header className="vc-head">
        <div>
          <span className="vc-kicker">Vendor Workspace</span>
          <h1 className="vc-title">Compliance Score</h1>
          <p className="vc-sub">
            Your Vendor Compliance Score (0-100) blends insurance, COI, W-9, licenses, reviews,
            on-time delivery, completion history, and venue ratings. A higher score ranks you higher
            in the marketplace, and powers the "Preferred because" reasons venues see.
          </p>
        </div>
      </header>

      <form
        className="vc-bar"
        onSubmit={(e) => {
          e.preventDefault();
          load(vendorId.trim());
        }}
      >
        <label>
          Vendor ID
          <input
            value={vendorId}
            placeholder="Paste your vendor id"
            onChange={(e) => setVendorId(e.target.value)}
          />
        </label>
        <button type="submit" className="vc-btn">Load compliance</button>
        {activeVendor && (
          <button type="button" className="vc-btn ghost" disabled={refreshing} onClick={refresh}>
            {refreshing ? 'Refreshing.' : 'Refresh score'}
          </button>
        )}
      </form>

      {error && <div className="vc-error">{error}</div>}

      {!activeVendor ? (
        <div className="vc-empty">Enter a vendor id above to view its compliance score.</div>
      ) : loading ? (
        <div className="vc-empty">Loading compliance.</div>
      ) : data ? (
        <div className="vc-grid">
          <section className="vc-scorecard">
            <div className={`vc-score vc-${scoreTone(score)}`}>
              <span className="vc-score-num">{Math.round(score)}</span>
              <span className="vc-score-max">/ 100</span>
            </div>
            <p className="vc-score-cap">Vendor Compliance Score</p>
          </section>

          <section className="vc-panel">
            <h2 className="vc-panel-title">What venues see</h2>
            <PreferredWhy why={data.why} score={data.score} />
            {data.why.length === 0 && (
              <p className="vc-note">
                No proof points yet. Upload insurance, add licenses, and complete projects to build
                your reasons.
              </p>
            )}
          </section>

          <section className="vc-panel vc-full">
            <h2 className="vc-panel-title">Score breakdown</h2>
            <ul className="vc-factors">
              {data.breakdown.map((f) => (
                <li key={f.key} className="vc-factor">
                  <div className="vc-factor-top">
                    <span className="vc-factor-label">{f.label}</span>
                    <span className="vc-factor-pts">
                      {f.earned}<span className="vc-factor-weight"> / {f.weight}</span>
                    </span>
                  </div>
                  <div className="vc-bar-track">
                    <div
                      className="vc-bar-fill"
                      style={{ width: `${f.weight > 0 ? (f.earned / f.weight) * 100 : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <div className="vc-empty">No compliance data for this vendor yet.</div>
      )}
    </div>
  );
}

const CSS = `
.vc { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.vc *,.vc *::before,.vc *::after { box-sizing:border-box; }
.vc h1,.vc h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.vc-head { margin-bottom:18px; }
.vc-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.vc-title { font-size:28px; color:var(--e); line-height:1.1; }
.vc-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:720px; line-height:1.5; }
.vc-bar { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
.vc-bar label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; flex:1 1 280px; }
.vc-bar input { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.vc-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 16px; cursor:pointer; }
.vc-btn:hover { background:var(--e2); }
.vc-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.vc-btn.ghost:hover { border-color:var(--e); }
.vc-btn:disabled { opacity:.6; cursor:default; }
.vc-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.vc-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.vc-grid { display:grid; grid-template-columns:240px 1fr; gap:16px; align-items:start; }
.vc-scorecard { background:#fff; border:1px solid var(--ln); border-radius:16px; padding:22px; text-align:center; }
.vc-score { display:inline-flex; align-items:baseline; gap:4px; padding:14px 22px; border-radius:16px; }
.vc-score-num { font-size:44px; font-weight:800; line-height:1; }
.vc-score-max { font-size:14px; font-weight:600; opacity:.7; }
.vc-high { background:rgba(30,93,74,.12); color:var(--e2); }
.vc-mid { background:rgba(201,163,91,.20); color:#7a5a17; }
.vc-low { background:rgba(154,58,40,.10); color:#9a3a28; }
.vc-score-cap { font-size:11px; letter-spacing:.6px; text-transform:uppercase; color:var(--mut); font-weight:700; margin:10px 0 0; }
.vc-panel { background:#fff; border:1px solid var(--ln); border-radius:16px; padding:20px; }
.vc-panel.vc-full { grid-column:1 / -1; }
.vc-panel-title { font-size:20px; color:var(--e); margin-bottom:12px; }
.vc-note { font-size:12.5px; color:var(--mut); margin:10px 0 0; line-height:1.5; }
.vc-factors { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:12px; }
.vc-factor-top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5px; }
.vc-factor-label { font-size:13px; color:var(--ink); font-weight:600; }
.vc-factor-pts { font-size:13px; color:var(--e2); font-weight:700; }
.vc-factor-weight { color:var(--mut); font-weight:600; font-size:11.5px; }
.vc-bar-track { height:7px; border-radius:999px; background:rgba(125,119,108,.14); overflow:hidden; }
.vc-bar-fill { height:100%; border-radius:999px; background:linear-gradient(90deg,var(--e2),var(--g)); }
@media (max-width:760px){ .vc-grid { grid-template-columns:1fr; } }
`;
