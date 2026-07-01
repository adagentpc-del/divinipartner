import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * Divini AI COO V2 - Pricing Intelligence.
 *
 * Shows the signed-in org's quote performance: overall win rate, win rate by
 * category, market rate bands (low/mid/high with where wins cluster), and a
 * ranked list of pricing recommendations (raise price, adjust price, change
 * packaging, add a new offering). All numbers come from GET
 * /pricing-intel/recommendations and are computed deterministically server
 * side over the org's own quotes + quote drafts. Graceful empty state before
 * data accumulates.
 */

type WinRateByPrice = {
  category: string;
  win_rate: number;
  won: number;
  lost: number;
  pending: number;
  decided: number;
};

type MarketRateBand = {
  category: string;
  low: number;
  mid: number;
  high: number;
  win_rate_at_or_below_mid: number;
  win_rate_above_mid: number;
};

type Recommendation = {
  kind: 'price_increase' | 'price_adjustment' | 'package_change' | 'new_offering';
  category: string;
  title: string;
  detail: string;
  priority: number;
};

type Analysis = {
  generated_at: string;
  overall_win_rate: number;
  winRateByPrice: WinRateByPrice[];
  marketRateBands: MarketRateBand[];
  recommendations: Recommendation[];
};

type ApiResult = { scope: string; analysis: Analysis };

const KIND_LABEL: Record<Recommendation['kind'], string> = {
  price_increase: 'Raise price',
  price_adjustment: 'Adjust price',
  package_change: 'Re-package',
  new_offering: 'New offering',
};

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return '-';
  return `$${Math.round(v).toLocaleString()}`;
}

function pct(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '-';
  return `${v}%`;
}

export default function PricingIntelligence() {
  const [data, setData] = useState<ApiResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await apiGet<ApiResult>('/pricing-intel/recommendations');
        if (alive) setData(r);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const analysis = data?.analysis ?? null;
  const hasData =
    analysis &&
    (analysis.winRateByPrice.length > 0 ||
      analysis.marketRateBands.length > 0 ||
      analysis.recommendations.length > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pricing Intelligence</h1>
          <div className="sub">Win rates, market rate bands, and price + packaging recommendations</div>
        </div>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Analyzing your quotes...</p></div>
      ) : !hasData ? (
        <div className="card">
          <p className="note" style={{ margin: 0, lineHeight: 1.7 }}>
            No pricing signal yet. Once you have submitted quotes (accepted, declined, or expired) and
            quote drafts, this page will show your win rate by category, the market rate bands you are
            quoting within, and concrete recommendations on where to raise price, re-price, re-package,
            or productize a new offering.
          </p>
        </div>
      ) : (
        <>
          <div className="grid cards3 kpi" style={{ marginBottom: 16 }}>
            <div className="card metric">
              <div className="k">Overall win rate</div>
              <div className="v">{pct(analysis!.overall_win_rate)}</div>
              <div className="d">accepted vs lost</div>
            </div>
            <div className="card metric">
              <div className="k">Categories analyzed</div>
              <div className="v">{analysis!.winRateByPrice.length}</div>
              <div className="d">with quote activity</div>
            </div>
            <div className="card metric">
              <div className="k">Recommendations</div>
              <div className="v">{analysis!.recommendations.length}</div>
              <div className="d">ranked by impact</div>
            </div>
          </div>

          {analysis!.recommendations.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="sectitle">Recommendations</div>
              <div className="grid cards2" style={{ gap: 12 }}>
                {analysis!.recommendations.map((r, i) => (
                  <div className="card" key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <span className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>
                        {KIND_LABEL[r.kind]}
                      </span>
                      <span className="note" style={{ fontWeight: 700 }}>{r.priority}</span>
                    </div>
                    <h3 style={{ margin: '4px 0 6px' }}>{r.title}</h3>
                    <div className="note" style={{ lineHeight: 1.6 }}>{r.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis!.winRateByPrice.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="sectitle">Win rate by category</div>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Win rate</th>
                    <th>Won</th>
                    <th>Lost</th>
                    <th>Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis!.winRateByPrice.map((w) => (
                    <tr key={w.category}>
                      <td>{w.category}</td>
                      <td>{pct(w.win_rate)}</td>
                      <td>{w.won}</td>
                      <td>{w.lost}</td>
                      <td>{w.pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {analysis!.marketRateBands.length > 0 && (
            <div className="card">
              <div className="sectitle">Market rate bands</div>
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Low</th>
                    <th>Mid</th>
                    <th>High</th>
                    <th>Win at/below mid</th>
                    <th>Win above mid</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis!.marketRateBands.map((b) => (
                    <tr key={b.category}>
                      <td>{b.category}</td>
                      <td>{money(b.low)}</td>
                      <td>{money(b.mid)}</td>
                      <td>{money(b.high)}</td>
                      <td>{pct(b.win_rate_at_or_below_mid)}</td>
                      <td>{pct(b.win_rate_above_mid)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
