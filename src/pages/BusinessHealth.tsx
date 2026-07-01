import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Divini AI COO V2 - Business Health Score page (AI-COO-V2-ROADMAP.md section 3).
 *
 * The ORG-LEVEL executive health score, DISTINCT from the per-entity Divini
 * Score. One view with three panels:
 *
 *   1. Health ring: the 0-100 Business Health Score for the actor's org, with a
 *      Recompute action (POST /business-health/recompute).
 *   2. Component bars: the nine weighted dimensions (revenue, activity, pipeline,
 *      contracts, referrals, bookings, retention, response speed, compliance),
 *      each showing earned-of-weight.
 *   3. Recommendations: the prioritized actions the score surfaced.
 *
 * Plus a portfolio Event Risk panel (GET /event-risk/portfolio) rolling the
 * existing per-event war room up across the org's active events: a portfolio
 * risk score, critical/warning counts, and the top risky events.
 *
 * All reads/writes go through the org-scoped, IDOR-safe API. Every panel
 * degrades gracefully to an empty state when no data exists yet (no fabrication).
 */

type Component = { key: string; label: string; weight: number; earned: number; value: number };
type Recommendation = { key: string; priority: number; title: string; detail: string };

type HealthView = {
  org_id: string;
  score: number;
  components: Component[] | null;
  recommendations: Recommendation[] | null;
  updated_at: string | null;
};

type RiskyEvent = {
  eventId: string;
  eventName: string | null;
  risk: number;
  criticalCount: number;
  warningCount: number;
  topAlert: { code: string; severity: 'warning' | 'critical'; message: string; recommendation: string } | null;
};

type RiskRollup = {
  portfolioRiskScore: number;
  topRiskyEvents: RiskyEvent[] | null;
  criticalCount: number;
  warningCount: number;
  eventsAtRisk: number;
  eventsScanned: number;
};

/** Color band for the health score (higher is better). */
function healthColor(score: number): string {
  if (score >= 75) return '#1E5D4A';
  if (score >= 50) return '#C9A35B';
  if (score >= 25) return '#c47b34';
  return '#9a3a28';
}

/** Color band for the risk score (lower is better). */
function riskColor(score: number): string {
  if (score >= 66) return '#9a3a28';
  if (score >= 33) return '#c47b34';
  if (score > 0) return '#C9A35B';
  return '#1E5D4A';
}

function ScoreRing({ score, color, caption }: { score: number; color: string; caption: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="bh-ring">
      <svg viewBox="0 0 130 130" width="130" height="130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#eee7da" strokeWidth="12" />
        <circle
          cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 65 65)"
        />
        <text x="65" y="62" textAnchor="middle" className="bh-ring-num" fill={color}>{score}</text>
        <text x="65" y="82" textAnchor="middle" className="bh-ring-of">/ 100</text>
      </svg>
      <span className="bh-ring-cap">{caption}</span>
    </div>
  );
}

export default function BusinessHealth() {
  const [view, setView] = useState<HealthView | null>(null);
  const [risk, setRisk] = useState<RiskRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGet<HealthView>('/business-health')
      .then((res) => { if (alive) { setView(res); setError(null); } })
      .catch((e) => { if (alive) { setError((e as Error).message); setView(null); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setRiskLoading(true);
    apiGet<RiskRollup>('/event-risk/portfolio')
      .then((res) => { if (alive) { setRisk(res); setRiskError(null); } })
      .catch((e) => { if (alive) { setRiskError((e as Error).message); setRisk(null); } })
      .finally(() => { if (alive) setRiskLoading(false); });
    return () => { alive = false; };
  }, []);

  async function recompute() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend<HealthView>('POST', '/business-health/recompute');
      setView(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const components = view?.components ?? [];
  const recommendations = view?.recommendations ?? [];
  const topRisky = risk?.topRiskyEvents ?? [];

  return (
    <div className="bh">
      <style>{CSS}</style>

      <header className="bh-head">
        <h1>Business Health</h1>
        <p className="bh-sub">
          Your organization's executive health score, 0 to 100, across revenue,
          activity, pipeline, contracts, referrals, bookings, retention, response
          speed, and compliance. This is an org-level score, distinct from the
          per-entity Divini Score.
        </p>
      </header>

      {/* ---- Health score + components ------------------------------------ */}
      <section className="bh-card">
        {loading ? (
          <p className="bh-muted">Loading your Business Health Score.</p>
        ) : error ? (
          <p className="bh-error">{error}</p>
        ) : view ? (
          <>
            <div className="bh-score-row">
              <ScoreRing score={view.score} color={healthColor(view.score)} caption="Business Health" />
              <div className="bh-score-meta">
                <span className="bh-muted">
                  {view.updated_at
                    ? `Cached ${new Date(view.updated_at).toLocaleString()}`
                    : 'Not yet cached (computed live)'}
                </span>
                <button className="bh-btn bh-btn-ghost" onClick={recompute} disabled={busy}>
                  {busy ? 'Recomputing.' : 'Recompute'}
                </button>
              </div>
            </div>

            <h2>Score components</h2>
            {components.length === 0 ? (
              <p className="bh-muted">
                No components yet. As events, quotes, invoices, and partners
                accumulate, each dimension will fill in.
              </p>
            ) : (
              <ul className="bh-bars">
                {components.map((c) => {
                  const pct = c.weight > 0 ? Math.round((c.earned / c.weight) * 100) : 0;
                  return (
                    <li key={c.key} className="bh-bar-row">
                      <span className="bh-bar-label">{c.label}</span>
                      <span className="bh-bar-track">
                        <span
                          className="bh-bar-fill"
                          style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: healthColor(pct) }}
                        />
                      </span>
                      <span className="bh-bar-val">{c.earned} / {c.weight}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : null}
      </section>

      {/* ---- Recommendations ---------------------------------------------- */}
      {view && (
        <section className="bh-card">
          <h2>Recommended actions</h2>
          {recommendations.length === 0 ? (
            <p className="bh-muted">
              No recommendations right now. Every dimension is at or near full
              credit, or there is not enough data yet.
            </p>
          ) : (
            <ol className="bh-recs">
              {recommendations.map((rec) => (
                <li key={rec.key} className="bh-rec">
                  <span className="bh-rec-pri">{rec.priority}</span>
                  <div>
                    <div className="bh-rec-title">{rec.title}</div>
                    <div className="bh-rec-detail">{rec.detail}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* ---- Portfolio event risk ----------------------------------------- */}
      <section className="bh-card">
        <h2>Portfolio event risk</h2>
        {riskLoading ? (
          <p className="bh-muted">Scanning your active events.</p>
        ) : riskError ? (
          <p className="bh-error">{riskError}</p>
        ) : risk ? (
          risk.eventsScanned === 0 ? (
            <p className="bh-muted">
              No active events to scan. Once you have live events, this panel
              rolls the per-event war room up across your whole portfolio.
            </p>
          ) : (
            <>
              <div className="bh-score-row">
                <ScoreRing score={risk.portfolioRiskScore} color={riskColor(risk.portfolioRiskScore)} caption="Risk (lower is better)" />
                <div className="bh-risk-counts">
                  <div className="bh-stat">
                    <span className="bh-stat-num bh-crit">{risk.criticalCount}</span>
                    <span className="bh-stat-lbl">Open critical</span>
                  </div>
                  <div className="bh-stat">
                    <span className="bh-stat-num bh-warn">{risk.warningCount}</span>
                    <span className="bh-stat-lbl">Open warning</span>
                  </div>
                  <div className="bh-stat">
                    <span className="bh-stat-num">{risk.eventsAtRisk} / {risk.eventsScanned}</span>
                    <span className="bh-stat-lbl">Events at risk</span>
                  </div>
                </div>
              </div>

              {topRisky.length === 0 ? (
                <p className="bh-muted">No open critical or warning alerts across your active events.</p>
              ) : (
                <ul className="bh-events">
                  {topRisky.map((ev) => (
                    <li key={ev.eventId} className="bh-event">
                      <div className="bh-event-head">
                        <span className="bh-event-name">{ev.eventName || ev.eventId}</span>
                        <span className="bh-event-tags">
                          {ev.criticalCount > 0 && <span className="bh-tag bh-tag-crit">{ev.criticalCount} critical</span>}
                          {ev.warningCount > 0 && <span className="bh-tag bh-tag-warn">{ev.warningCount} warning</span>}
                        </span>
                      </div>
                      {ev.topAlert && (
                        <div className="bh-event-alert">
                          <span className={ev.topAlert.severity === 'critical' ? 'bh-crit' : 'bh-warn'}>
                            {ev.topAlert.message}
                          </span>
                          <span className="bh-event-rec">{ev.topAlert.recommendation}</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )
        ) : null}
      </section>
    </div>
  );
}

const CSS = `
.bh { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:980px; margin:0 auto;
  padding:24px 20px 56px; }
.bh *,.bh *::before,.bh *::after { box-sizing:border-box; }
.bh-head h1 { font-size:26px; margin:0 0 6px; color:var(--e); font-weight:800; }
.bh-sub { font-size:14px; color:var(--mut); margin:0 0 8px; max-width:680px; line-height:1.5; }
.bh-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:20px; margin-top:18px; }
.bh-card h2 { font-size:15px; margin:18px 0 14px; color:var(--e); font-weight:700; }
.bh-card h2:first-child { margin-top:0; }
.bh-muted { font-size:12.5px; color:var(--mut); line-height:1.5; margin:0; }
.bh-error { font-size:13px; color:#9a3a28; margin:0; }
.bh-score-row { display:flex; align-items:center; gap:28px; flex-wrap:wrap; }
.bh-ring { display:flex; flex-direction:column; align-items:center; gap:6px; }
.bh-ring-num { font-size:30px; font-weight:800; }
.bh-ring-of { font-size:11px; fill:var(--mut); }
.bh-ring-cap { font-size:11px; letter-spacing:.4px; text-transform:uppercase; color:var(--mut); font-weight:700; }
.bh-score-meta { display:flex; flex-direction:column; gap:10px; align-items:flex-start; }
.bh-btn { font-size:13px; font-weight:700; padding:10px 18px; border-radius:9px; border:none;
  background:var(--e2); color:#fff; cursor:pointer; }
.bh-btn:disabled { opacity:.5; cursor:not-allowed; }
.bh-btn-ghost { background:transparent; color:var(--e2); border:1px solid var(--e2); }
.bh-bars { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
.bh-bar-row { display:grid; grid-template-columns:140px 1fr 64px; align-items:center; gap:12px; }
.bh-bar-label { font-size:13px; font-weight:600; }
.bh-bar-track { height:10px; background:#eee7da; border-radius:6px; overflow:hidden; }
.bh-bar-fill { display:block; height:100%; border-radius:6px; transition:width .3s ease; }
.bh-bar-val { font-size:12px; color:var(--mut); text-align:right; font-variant-numeric:tabular-nums; }
.bh-recs { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:12px; }
.bh-rec { display:flex; gap:12px; align-items:flex-start; }
.bh-rec-pri { flex:none; width:24px; height:24px; border-radius:50%; background:var(--e2); color:#fff;
  font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center; }
.bh-rec-title { font-size:14px; font-weight:700; color:var(--e); }
.bh-rec-detail { font-size:12.5px; color:var(--mut); line-height:1.5; margin-top:2px; }
.bh-risk-counts { display:flex; gap:24px; flex-wrap:wrap; }
.bh-stat { display:flex; flex-direction:column; gap:2px; }
.bh-stat-num { font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; }
.bh-stat-lbl { font-size:10.5px; letter-spacing:.4px; text-transform:uppercase; color:var(--mut); font-weight:700; }
.bh-crit { color:#9a3a28; }
.bh-warn { color:#c47b34; }
.bh-events { list-style:none; margin:14px 0 0; padding:0; display:flex; flex-direction:column; gap:10px; }
.bh-event { border:1px solid var(--ln); border-radius:11px; padding:12px 14px; }
.bh-event-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.bh-event-name { font-size:14px; font-weight:700; color:var(--e); }
.bh-event-tags { display:flex; gap:6px; }
.bh-tag { font-size:11px; font-weight:700; padding:2px 9px; border-radius:20px; }
.bh-tag-crit { background:#f6e3dd; color:#9a3a28; }
.bh-tag-warn { background:#f6ecda; color:#c47b34; }
.bh-event-alert { margin-top:8px; display:flex; flex-direction:column; gap:3px; }
.bh-event-alert > span:first-child { font-size:13px; font-weight:600; }
.bh-event-rec { font-size:12px; color:var(--mut); line-height:1.45; }
`;
