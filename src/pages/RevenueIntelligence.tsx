import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * Divini AI COO V2 - Revenue Intelligence page.
 *
 * Calls GET /revenue-intel/trends and renders the deterministic trend insights
 * (revenue, quote volume, booking conversion, win rate, average deal size,
 * emerging categories) as cards, each showing its direction (up / down / flat)
 * and signed magnitude. Emerging categories are listed beneath the insights.
 *
 * The page is org-scoped + IDOR-safe at the API layer. It degrades gracefully:
 * when there is no usable history it shows an honest empty state rather than
 * fabricated figures.
 */

type Direction = 'up' | 'down' | 'flat';

type TrendInsight = {
  key: string;
  label: string;
  direction: Direction;
  magnitude: number;
  unit: '%' | 'count' | 'currency' | 'ratio';
  detail: string;
};

type EmergingCategory = {
  category: string;
  recent: number;
  prior: number;
  deltaPct: number;
};

type Trends = {
  hasData: boolean;
  months: number;
  insights: TrendInsight[];
  emergingCategories: EmergingCategory[];
  orgId?: string;
  window?: number;
};

const ARROW: Record<Direction, string> = { up: '▲', down: '▼', flat: '—' };

function fmtMagnitude(i: TrendInsight): string {
  if (i.unit === '%') {
    const s = i.magnitude > 0 ? '+' : '';
    return `${s}${i.magnitude}%`;
  }
  if (i.unit === 'currency') return `$${Math.round(i.magnitude).toLocaleString()}`;
  return `${i.magnitude}`;
}

export default function RevenueIntelligence() {
  const [trends, setTrends] = useState<Trends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiGet<{ trends: Trends }>('/revenue-intel/trends')
      .then((res) => {
        if (alive) setTrends(res.trends);
      })
      .catch((e) => {
        if (alive) {
          setError((e as Error).message);
          setTrends(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const hasInsights = !!trends?.hasData && (trends?.insights.length ?? 0) > 0;

  return (
    <div className="rintel">
      <style>{CSS}</style>

      <header className="rintel-head">
        <h1>Revenue Intelligence</h1>
        <p className="rintel-sub">
          Executive trend insights across revenue, quote volume, booking
          conversion, win rate, deal size, and emerging categories. Computed
          deterministically from your events, quotes, invoices, and payments.
        </p>
        {trends?.hasData && (
          <p className="rintel-muted">
            Based on {trends.months} month{trends.months === 1 ? '' : 's'} of history.
          </p>
        )}
      </header>

      {loading && <p className="rintel-muted">Loading trends.</p>}
      {error && <p className="rintel-error">{error}</p>}

      {!loading && !error && !hasInsights && (
        <section className="rintel-card rintel-empty">
          <h2>No trend data yet</h2>
          <p className="rintel-muted">
            Once you have booked events, submitted quotes, and recorded payments,
            your revenue trends will appear here.
          </p>
        </section>
      )}

      {hasInsights && (
        <section className="rintel-grid">
          {trends!.insights.map((i) => (
            <article key={i.key} className={`rintel-insight dir-${i.direction}`}>
              <div className="rintel-insight-top">
                <span className="rintel-insight-label">{i.label}</span>
                <span className={`rintel-arrow dir-${i.direction}`}>
                  {ARROW[i.direction]} {fmtMagnitude(i)}
                </span>
              </div>
              <p className="rintel-insight-detail">{i.detail}</p>
            </article>
          ))}
        </section>
      )}

      {trends?.emergingCategories && trends.emergingCategories.length > 0 && (
        <section className="rintel-card">
          <h2>Emerging categories</h2>
          <table className="rintel-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Prior</th>
                <th>Recent</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {trends.emergingCategories.map((c) => (
                <tr key={c.category}>
                  <td className="rintel-cat">{c.category}</td>
                  <td>{c.prior}</td>
                  <td>{c.recent}</td>
                  <td className="rintel-up">+{c.deltaPct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

const CSS = `
.rintel { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  --bg:#fbf9f4; --up:#1E5D4A; --down:#9a3a28; --flat:#7d776c;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:980px; margin:0 auto;
  padding:24px 20px 56px; }
.rintel *,.rintel *::before,.rintel *::after { box-sizing:border-box; }
.rintel-head h1 { font-size:26px; margin:0 0 6px; color:var(--e); font-weight:800; }
.rintel-sub { font-size:14px; color:var(--mut); margin:0 0 6px; max-width:660px; line-height:1.5; }
.rintel-muted { font-size:12px; color:var(--mut); margin:4px 0 0; }
.rintel-error { font-size:13px; color:#9a3a28; margin-top:10px; }
.rintel-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:14px;
  margin-top:18px; }
.rintel-insight { background:#fff; border:1px solid var(--ln); border-left:4px solid var(--flat);
  border-radius:12px; padding:16px; }
.rintel-insight.dir-up { border-left-color:var(--up); }
.rintel-insight.dir-down { border-left-color:var(--down); }
.rintel-insight-top { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.rintel-insight-label { font-size:12px; letter-spacing:.4px; text-transform:uppercase;
  color:var(--mut); font-weight:700; }
.rintel-arrow { font-size:14px; font-weight:800; }
.rintel-arrow.dir-up { color:var(--up); }
.rintel-arrow.dir-down { color:var(--down); }
.rintel-arrow.dir-flat { color:var(--flat); }
.rintel-insight-detail { font-size:13.5px; color:var(--ink); margin:10px 0 0; line-height:1.45; }
.rintel-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:20px;
  margin-top:18px; }
.rintel-card h2 { font-size:15px; margin:0 0 14px; color:var(--e); font-weight:700; }
.rintel-empty { text-align:center; }
.rintel-table { width:100%; border-collapse:collapse; font-size:13px; }
.rintel-table th { text-align:left; font-size:10px; letter-spacing:.6px; text-transform:uppercase;
  color:var(--mut); padding:6px 10px; border-bottom:1px solid var(--ln); }
.rintel-table td { padding:9px 10px; border-bottom:1px solid #f1ece2; }
.rintel-cat { text-transform:capitalize; font-weight:600; }
.rintel-up { color:var(--up); font-weight:700; }
`;
