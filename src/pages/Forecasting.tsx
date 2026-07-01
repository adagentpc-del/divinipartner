import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * Divini AI COO V2 - Forecasting page.
 *
 * Calls GET /revenue-intel/forecast and renders the deterministic projection for
 * the next period: revenue, bookings, vendor demand, sponsor demand, venue
 * occupancy, the month-of-year seasonality profile, and a pipeline-health read.
 *
 * Org-scoped + IDOR-safe at the API layer. Degrades gracefully: an empty history
 * yields hasData=false and an honest empty state instead of fabricated numbers.
 */

type ForecastPoint = {
  period: string;
  value: number;
  low: number;
  high: number;
  method: string;
};

type SeasonalityMonth = { month: number; label: string; index: number };

type PipelineHealth = {
  score: number;
  level: 'strong' | 'steady' | 'soft' | 'thin';
  detail: string;
};

type Forecast = {
  hasData: boolean;
  months: number;
  horizon: string;
  revenue: ForecastPoint;
  bookings: ForecastPoint;
  vendorDemand: ForecastPoint;
  sponsorDemand: ForecastPoint;
  venueOccupancy: ForecastPoint;
  seasonality: SeasonalityMonth[];
  pipelineHealth: PipelineHealth;
  orgId?: string;
  window?: number;
};

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtNum = (n: number) => `${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

type FigureDef = {
  key: keyof Pick<Forecast, 'revenue' | 'bookings' | 'vendorDemand' | 'sponsorDemand' | 'venueOccupancy'>;
  label: string;
  fmt: (n: number) => string;
};

const FIGURES: FigureDef[] = [
  { key: 'revenue', label: 'Revenue', fmt: fmtMoney },
  { key: 'bookings', label: 'Bookings', fmt: fmtNum },
  { key: 'vendorDemand', label: 'Vendor demand', fmt: fmtNum },
  { key: 'sponsorDemand', label: 'Sponsor demand', fmt: fmtNum },
  { key: 'venueOccupancy', label: 'Venue occupancy', fmt: fmtPct },
];

export default function Forecasting() {
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    apiGet<{ forecast: Forecast }>('/revenue-intel/forecast')
      .then((res) => {
        if (alive) setForecast(res.forecast);
      })
      .catch((e) => {
        if (alive) {
          setError((e as Error).message);
          setForecast(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const ready = !!forecast?.hasData;

  return (
    <div className="fcast">
      <style>{CSS}</style>

      <header className="fcast-head">
        <h1>Forecasting</h1>
        <p className="fcast-sub">
          A deterministic projection of the next period built from a trailing
          moving average, a linear trend, and month-of-year seasonality. Covers
          revenue, bookings, vendor and sponsor demand, venue occupancy, and
          pipeline health.
        </p>
        {ready && forecast!.horizon && (
          <p className="fcast-muted">
            Forecast horizon {forecast!.horizon} from {forecast!.months} month
            {forecast!.months === 1 ? '' : 's'} of history.
          </p>
        )}
      </header>

      {loading && <p className="fcast-muted">Loading forecast.</p>}
      {error && <p className="fcast-error">{error}</p>}

      {!loading && !error && !ready && (
        <section className="fcast-card fcast-empty">
          <h2>Not enough data to forecast</h2>
          <p className="fcast-muted">
            Once you have a few months of revenue, bookings, and pipeline
            activity, your forward projection will appear here.
          </p>
        </section>
      )}

      {ready && (
        <>
          <section className="fcast-grid">
            {FIGURES.map((f) => {
              const p = forecast![f.key];
              return (
                <article key={f.key} className="fcast-figure">
                  <span className="fcast-figure-label">{f.label}</span>
                  <span className="fcast-figure-value">{f.fmt(p.value)}</span>
                  <span className="fcast-figure-band">
                    range {f.fmt(p.low)} – {f.fmt(p.high)}
                  </span>
                </article>
              );
            })}
          </section>

          <section className={`fcast-card fcast-pipeline level-${forecast!.pipelineHealth.level}`}>
            <div className="fcast-pipeline-top">
              <h2>Pipeline health</h2>
              <span className="fcast-pipeline-score">
                {forecast!.pipelineHealth.score}
                <small>/100</small>
              </span>
            </div>
            <p className="fcast-pipeline-level">{forecast!.pipelineHealth.level}</p>
            <p className="fcast-muted">{forecast!.pipelineHealth.detail}</p>
          </section>

          {forecast!.seasonality.length > 0 && (
            <section className="fcast-card">
              <h2>Seasonality profile</h2>
              <p className="fcast-muted">
                Relative revenue index by calendar month (1.0 = average month).
              </p>
              <div className="fcast-season">
                {forecast!.seasonality.map((s) => (
                  <div key={s.month} className="fcast-season-col">
                    <div className="fcast-season-bar-wrap">
                      <div
                        className="fcast-season-bar"
                        style={{ height: `${Math.min(100, Math.round(s.index * 50))}%` }}
                        title={`${s.label}: ${s.index}`}
                      />
                    </div>
                    <span className="fcast-season-month">{s.label}</span>
                    <span className="fcast-season-idx">{s.index}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

const CSS = `
.fcast { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:980px;
  margin:0 auto; padding:24px 20px 56px; }
.fcast *,.fcast *::before,.fcast *::after { box-sizing:border-box; }
.fcast-head h1 { font-size:26px; margin:0 0 6px; color:var(--e); font-weight:800; }
.fcast-sub { font-size:14px; color:var(--mut); margin:0 0 6px; max-width:680px; line-height:1.5; }
.fcast-muted { font-size:12px; color:var(--mut); margin:4px 0 0; }
.fcast-error { font-size:13px; color:#9a3a28; margin-top:10px; }
.fcast-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:14px;
  margin-top:18px; }
.fcast-figure { background:#fff; border:1px solid var(--ln); border-radius:12px; padding:16px;
  display:flex; flex-direction:column; gap:4px; }
.fcast-figure-label { font-size:11px; letter-spacing:.4px; text-transform:uppercase;
  color:var(--mut); font-weight:700; }
.fcast-figure-value { font-size:24px; font-weight:800; color:var(--e); }
.fcast-figure-band { font-size:11.5px; color:var(--mut); }
.fcast-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:20px;
  margin-top:18px; }
.fcast-card h2 { font-size:15px; margin:0 0 6px; color:var(--e); font-weight:700; }
.fcast-empty { text-align:center; }
.fcast-pipeline { border-left:4px solid var(--mut); }
.fcast-pipeline.level-strong { border-left-color:#1E5D4A; }
.fcast-pipeline.level-steady { border-left-color:#C9A35B; }
.fcast-pipeline.level-soft { border-left-color:#c98a3b; }
.fcast-pipeline.level-thin { border-left-color:#9a3a28; }
.fcast-pipeline-top { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.fcast-pipeline-score { font-size:28px; font-weight:800; color:var(--e); }
.fcast-pipeline-score small { font-size:13px; color:var(--mut); font-weight:600; }
.fcast-pipeline-level { font-size:13px; text-transform:capitalize; font-weight:700; color:var(--e2);
  margin:2px 0 4px; }
.fcast-season { display:flex; align-items:flex-end; gap:6px; margin-top:14px; }
.fcast-season-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; }
.fcast-season-bar-wrap { width:100%; height:90px; display:flex; align-items:flex-end;
  background:var(--bg); border-radius:6px; overflow:hidden; }
.fcast-season-bar { width:100%; background:var(--e2); border-radius:6px 6px 0 0; min-height:2px; }
.fcast-season-month { font-size:10px; color:var(--mut); font-weight:700; }
.fcast-season-idx { font-size:10px; color:var(--ink); }
`;
