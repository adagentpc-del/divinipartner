import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

/**
 * Divini Business Review (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
 * slice 12 -- the final slice, "summarizes the whole system"). Originally
 * built pre-spec as the AI COO V2 Business Health Score page.
 *
 * The response shape now carries a `depth` earned by the org's tier (spec
 * section 18):
 *   - "basic"    (Free)  -- score only, no breakdown, no recommendations.
 *   - "standard" (Plus)  -- + component breakdown + recommendations.
 *   - "full"     (Pro)   -- + a cross-tool Systems Summary reading Divini
 *                           Pipeline, Scope Builder, Proposal Studio,
 *                           Follow-Up Desk, and Change Desk live.
 *
 * The portfolio Event Risk panel rolls the existing per-event war room up
 * across the org's active events; it is naturally Pro-only already, since it
 * is built on the Pro-gated per-event scan (Divini Event Command), so lower
 * tiers correctly see it as empty rather than needing a separate gate here.
 *
 * All reads/writes go through the org-scoped, IDOR-safe API. Every panel
 * degrades gracefully to an empty state when no data exists yet (no fabrication).
 */

type Depth = 'basic' | 'standard' | 'full';
type Component = { key: string; label: string; weight: number; earned: number; value: number };
type Recommendation = { key: string; priority: number; title: string; detail: string };
type SystemsSummaryItem = { key: string; label: string; detail: string; href: string };

type ReviewView = {
  org_id: string;
  depth: Depth;
  score: number;
  components: Component[] | null;
  recommendations: Recommendation[] | null;
  systemsSummary: { items: SystemsSummaryItem[] } | null;
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

const DEPTH_LABEL: Record<Depth, string> = {
  basic: 'Basic business summary (Free)',
  standard: 'Standard business review (Plus)',
  full: 'Full Business Review (Pro)',
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
    <div className="brv-ring">
      <svg viewBox="0 0 130 130" width="130" height="130">
        <circle cx="65" cy="65" r={r} fill="none" stroke="#eee7da" strokeWidth="12" />
        <circle
          cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round" strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 65 65)"
        />
        <text x="65" y="62" textAnchor="middle" className="brv-ring-num" fill={color}>{score}</text>
        <text x="65" y="82" textAnchor="middle" className="brv-ring-of">/ 100</text>
      </svg>
      <span className="brv-ring-cap">{caption}</span>
    </div>
  );
}

export default function BusinessReview() {
  const [view, setView] = useState<ReviewView | null>(null);
  const [risk, setRisk] = useState<RiskRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [riskLoading, setRiskLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [riskError, setRiskError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    apiGet<ReviewView>('/business-review')
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
      const res = await apiSend<ReviewView>('POST', '/business-review/recompute');
      setView(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const components = view?.components ?? [];
  const recommendations = view?.recommendations ?? [];
  const summaryItems = view?.systemsSummary?.items ?? [];
  const topRisky = risk?.topRiskyEvents ?? [];

  return (
    <div className="brv">
      <style>{CSS}</style>

      <header className="brv-head">
        <h1>Divini Business Review</h1>
        <p className="brv-sub">
          Your organization's executive score, 0 to 100, across revenue,
          activity, pipeline, contracts, referrals, bookings, retention,
          response speed, and compliance -- what is working and what needs
          attention, in one place.
        </p>
        {view && (
          <span className="brv-depth-badge">{DEPTH_LABEL[view.depth]}</span>
        )}
      </header>

      {/* ---- Health score + components ------------------------------------ */}
      <section className="brv-card">
        {loading ? (
          <p className="brv-muted">Loading your Business Review.</p>
        ) : error ? (
          <p className="brv-error">{error}</p>
        ) : view ? (
          <>
            <div className="brv-score-row">
              <ScoreRing score={view.score} color={healthColor(view.score)} caption="Business score" />
              <div className="brv-score-meta">
                <span className="brv-muted">
                  {view.updated_at
                    ? `Cached ${new Date(view.updated_at).toLocaleString()}`
                    : 'Not yet cached (computed live)'}
                </span>
                <button className="brv-btn brv-btn-ghost" onClick={recompute} disabled={busy}>
                  {busy ? 'Recomputing.' : 'Recompute'}
                </button>
              </div>
            </div>

            {view.depth === 'basic' ? (
              <p className="brv-muted brv-upsell">
                Upgrade to Plus for the full component breakdown and prioritized
                recommendations, or Pro for the complete Business Review with a
                live snapshot across every Divini tool.
              </p>
            ) : (
              <>
                <h2>Score components</h2>
                {components.length === 0 ? (
                  <p className="brv-muted">
                    No components yet. As events, quotes, invoices, and partners
                    accumulate, each dimension will fill in.
                  </p>
                ) : (
                  <ul className="brv-bars">
                    {components.map((c) => {
                      const pct = c.weight > 0 ? Math.round((c.earned / c.weight) * 100) : 0;
                      return (
                        <li key={c.key} className="brv-bar-row">
                          <span className="brv-bar-label">{c.label}</span>
                          <span className="brv-bar-track">
                            <span
                              className="brv-bar-fill"
                              style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: healthColor(pct) }}
                            />
                          </span>
                          <span className="brv-bar-val">{c.earned} / {c.weight}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </>
        ) : null}
      </section>

      {/* ---- Recommendations ---------------------------------------------- */}
      {view && view.depth !== 'basic' && (
        <section className="brv-card">
          <h2>What needs attention</h2>
          {recommendations.length === 0 ? (
            <p className="brv-muted">
              No recommendations right now. Every dimension is at or near full
              credit, or there is not enough data yet.
            </p>
          ) : (
            <ol className="brv-recs">
              {recommendations.map((rec) => (
                <li key={rec.key} className="brv-rec">
                  <span className="brv-rec-pri">{rec.priority}</span>
                  <div>
                    <div className="brv-rec-title">{rec.title}</div>
                    <div className="brv-rec-detail">{rec.detail}</div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* ---- Systems summary (Pro / full depth only) ----------------------- */}
      {view && view.depth === 'full' && (
        <section className="brv-card">
          <h2>What is working -- systems summary</h2>
          <p className="brv-muted">
            A live snapshot straight from every Divini tool in your workspace.
          </p>
          {summaryItems.length === 0 ? (
            <p className="brv-muted">No cross-tool activity yet.</p>
          ) : (
            <ul className="brv-summary">
              {summaryItems.map((item) => (
                <li key={item.key} className="brv-summary-row">
                  <span className="brv-summary-label">{item.label}</span>
                  <span className="brv-summary-detail">{item.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ---- Portfolio event risk ----------------------------------------- */}
      <section className="brv-card">
        <h2>Portfolio event risk</h2>
        {riskLoading ? (
          <p className="brv-muted">Scanning your active events.</p>
        ) : riskError ? (
          <p className="brv-error">{riskError}</p>
        ) : risk ? (
          risk.eventsScanned === 0 ? (
            <p className="brv-muted">
              No active events scanned. This panel rolls Divini Event Command's
              per-event risk scan up across your whole portfolio (Pro).
            </p>
          ) : (
            <>
              <div className="brv-score-row">
                <ScoreRing score={risk.portfolioRiskScore} color={riskColor(risk.portfolioRiskScore)} caption="Risk (lower is better)" />
                <div className="brv-risk-counts">
                  <div className="brv-stat">
                    <span className="brv-stat-num brv-crit">{risk.criticalCount}</span>
                    <span className="brv-stat-lbl">Open critical</span>
                  </div>
                  <div className="brv-stat">
                    <span className="brv-stat-num brv-warn">{risk.warningCount}</span>
                    <span className="brv-stat-lbl">Open warning</span>
                  </div>
                  <div className="brv-stat">
                    <span className="brv-stat-num">{risk.eventsAtRisk} / {risk.eventsScanned}</span>
                    <span className="brv-stat-lbl">Events at risk</span>
                  </div>
                </div>
              </div>

              {topRisky.length === 0 ? (
                <p className="brv-muted">No open critical or warning alerts across your active events.</p>
              ) : (
                <ul className="brv-events">
                  {topRisky.map((ev) => (
                    <li key={ev.eventId} className="brv-event">
                      <div className="brv-event-head">
                        <span className="brv-event-name">{ev.eventName || ev.eventId}</span>
                        <span className="brv-event-tags">
                          {ev.criticalCount > 0 && <span className="brv-tag brv-tag-crit">{ev.criticalCount} critical</span>}
                          {ev.warningCount > 0 && <span className="brv-tag brv-tag-warn">{ev.warningCount} warning</span>}
                        </span>
                      </div>
                      {ev.topAlert && (
                        <div className="brv-event-alert">
                          <span className={ev.topAlert.severity === 'critical' ? 'brv-crit' : 'brv-warn'}>
                            {ev.topAlert.message}
                          </span>
                          <span className="brv-event-rec">{ev.topAlert.recommendation}</span>
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
.brv { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#6b6459; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:980px; margin:0 auto;
  padding:24px 20px 56px; }
.brv *,.brv *::before,.brv *::after { box-sizing:border-box; }
.brv-head h1 { font-size:26px; margin:0 0 6px; color:var(--e); font-weight:800; }
.brv-sub { font-size:14px; color:var(--mut); margin:0 0 8px; max-width:680px; line-height:1.5; }
.brv-depth-badge { display:inline-block; font-size:11.5px; font-weight:700; letter-spacing:.3px;
  color:var(--e); background:#f3ecda; border:1px solid var(--g); border-radius:20px; padding:4px 12px; }
.brv-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:20px; margin-top:18px; }
.brv-card h2 { font-size:15px; margin:18px 0 14px; color:var(--e); font-weight:700; }
.brv-card h2:first-child { margin-top:0; }
.brv-muted { font-size:12.5px; color:var(--mut); line-height:1.5; margin:0; }
.brv-upsell { margin-top:14px; }
.brv-error { font-size:13px; color:#9a3a28; margin:0; }
.brv-score-row { display:flex; align-items:center; gap:28px; flex-wrap:wrap; }
.brv-ring { display:flex; flex-direction:column; align-items:center; gap:6px; }
.brv-ring-num { font-size:30px; font-weight:800; }
.brv-ring-of { font-size:11px; fill:var(--mut); }
.brv-ring-cap { font-size:11px; letter-spacing:.4px; text-transform:uppercase; color:var(--mut); font-weight:700; }
.brv-score-meta { display:flex; flex-direction:column; gap:10px; align-items:flex-start; }
.brv-btn { font-size:13px; font-weight:700; padding:10px 18px; border-radius:9px; border:none;
  background:var(--e2); color:#fff; cursor:pointer; }
.brv-btn:disabled { opacity:.5; cursor:not-allowed; }
.brv-btn-ghost { background:transparent; color:var(--e2); border:1px solid var(--e2); }
.brv-bars { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
.brv-bar-row { display:grid; grid-template-columns:140px 1fr 64px; align-items:center; gap:12px; }
.brv-bar-label { font-size:13px; font-weight:600; }
.brv-bar-track { height:10px; background:#eee7da; border-radius:6px; overflow:hidden; }
.brv-bar-fill { display:block; height:100%; border-radius:6px; transition:width .3s ease; }
.brv-bar-val { font-size:12px; color:var(--mut); text-align:right; font-variant-numeric:tabular-nums; }
.brv-recs { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:12px; }
.brv-rec { display:flex; gap:12px; align-items:flex-start; }
.brv-rec-pri { flex:none; width:24px; height:24px; border-radius:50%; background:var(--e2); color:#fff;
  font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center; }
.brv-rec-title { font-size:14px; font-weight:700; color:var(--e); }
.brv-rec-detail { font-size:12.5px; color:var(--mut); line-height:1.5; margin-top:2px; }
.brv-summary { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:10px; }
.brv-summary-row { display:flex; align-items:center; justify-content:space-between; gap:14px;
  border:1px solid var(--ln); border-radius:10px; padding:10px 14px; flex-wrap:wrap; }
.brv-summary-label { font-size:13px; font-weight:700; color:var(--e); }
.brv-summary-detail { font-size:12.5px; color:var(--mut); }
.brv-risk-counts { display:flex; gap:24px; flex-wrap:wrap; }
.brv-stat { display:flex; flex-direction:column; gap:2px; }
.brv-stat-num { font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; }
.brv-stat-lbl { font-size:10.5px; letter-spacing:.4px; text-transform:uppercase; color:var(--mut); font-weight:700; }
.brv-crit { color:#9a3a28; }
.brv-warn { color:#c47b34; }
.brv-events { list-style:none; margin:14px 0 0; padding:0; display:flex; flex-direction:column; gap:10px; }
.brv-event { border:1px solid var(--ln); border-radius:11px; padding:12px 14px; }
.brv-event-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.brv-event-name { font-size:14px; font-weight:700; color:var(--e); }
.brv-event-tags { display:flex; gap:6px; }
.brv-tag { font-size:11px; font-weight:700; padding:2px 9px; border-radius:20px; }
.brv-tag-crit { background:#f6e3dd; color:#9a3a28; }
.brv-tag-warn { background:#f6ecda; color:#c47b34; }
.brv-event-alert { margin-top:8px; display:flex; flex-direction:column; gap:3px; }
.brv-event-alert > span:first-child { font-size:13px; font-weight:600; }
.brv-event-rec { font-size:12px; color:var(--mut); line-height:1.45; }
`;
