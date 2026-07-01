import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

/**
 * Friction Elimination - Sponsorship Intelligence (Upgrade 16). Two modes:
 *   - Metrics: capture/read the intelligence for one sponsorship opportunity
 *     (impressions, audience demographics, historical performance, revenue, and
 *     asset availability) via GET/PUT /sponsorship-intel/metrics.
 *   - Recommend: a deterministic ranking of a venue's own opportunities for an
 *     event brief, or a brand<->venue match across open opportunities, via
 *     POST /sponsorship-intel/recommend. Shows the recommended opportunities
 *     plus an estimated-impressions / estimated-revenue rollup.
 *
 * The managed venue id comes from ?venue=<id> (remembered in localStorage,
 * shared with the other Venue Intelligence pages).
 */

type Metrics = {
  id: string;
  sponsorship_opportunity_id?: string | null;
  impressions?: number | null;
  demographics?: unknown;
  historical_performance?: unknown;
  revenue?: number | null;
  asset_availability?: unknown;
  updated_at?: string;
};

type Recommendation = {
  id: string;
  venue_id?: string | null;
  name: string;
  category?: string | null;
  score: number;
  reasons: { label: string; value: number }[];
  estimated_impressions: number;
  estimated_revenue: number;
  price?: number | null;
};

type Rollup = { count: number; estimated_impressions: number; estimated_revenue: number };
type RecommendResult = { recommendations: Recommendation[]; rollup: Rollup };

const VENUE_KEY = 'dp.vi.venueId';

const CATEGORIES = [
  'title', 'presenting', 'naming_rights', 'activation', 'digital', 'hospitality',
  'signage', 'experiential', 'product_sampling', 'content', 'other',
];

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '-';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function count(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '-';
  return v.toLocaleString();
}

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pretty-print a jsonb value as compact key: value lines, or a fallback. */
function jsonLines(v: unknown): string[] {
  if (!v || typeof v !== 'object') return [];
  return Object.entries(v as Record<string, unknown>).map(
    ([k, val]) => `${k.replace(/_/g, ' ')}: ${typeof val === 'object' ? JSON.stringify(val) : String(val)}`,
  );
}

export default function SponsorshipIntel() {
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<'recommend' | 'metrics'>('recommend');
  const [err, setErr] = useState<string | null>(null);

  // Shared venue id
  const initialVenue = params.get('venue') || localStorage.getItem(VENUE_KEY) || '';
  const [venueId, setVenueId] = useState<string>(initialVenue);
  const [venueInput, setVenueInput] = useState<string>(initialVenue);

  // Recommend (event side) state
  const [recMode, setRecMode] = useState<'event' | 'brand'>('event');
  const [venueType, setVenueType] = useState('');
  const [eventType, setEventType] = useState('');
  const [budget, setBudget] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [audience, setAudience] = useState('');
  const [brandCategory, setBrandCategory] = useState('');
  const [minImpressions, setMinImpressions] = useState('');
  const [recResult, setRecResult] = useState<RecommendResult | null>(null);
  const [recBusy, setRecBusy] = useState(false);

  // Metrics state
  const [opportunityId, setOpportunityId] = useState('');
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [mImpressions, setMImpressions] = useState('');
  const [mRevenue, setMRevenue] = useState('');
  const [mDemographics, setMDemographics] = useState('');
  const [mHistorical, setMHistorical] = useState('');
  const [mAssets, setMAssets] = useState('');
  const [metricsBusy, setMetricsBusy] = useState(false);

  function applyVenue() {
    const id = venueInput.trim();
    setVenueId(id);
    if (id) {
      localStorage.setItem(VENUE_KEY, id);
      setParams({ venue: id });
    } else {
      localStorage.removeItem(VENUE_KEY);
      setParams({});
    }
  }

  async function runRecommend() {
    setRecBusy(true);
    setErr(null);
    try {
      if (recMode === 'brand') {
        const body = {
          mode: 'brand',
          audience: audience.trim() || undefined,
          budget: num(budget),
          category: brandCategory || undefined,
          minImpressions: num(minImpressions),
        };
        const r = await apiSend<RecommendResult>('POST', '/sponsorship-intel/recommend', body);
        setRecResult(r);
      } else {
        if (!venueId) { setErr('Enter a venue id to recommend its opportunities'); return; }
        const body = {
          venueId,
          venueType: venueType.trim() || undefined,
          eventType: eventType.trim() || undefined,
          budget: num(budget),
          guestCount: num(guestCount),
          audience: audience.trim() || undefined,
        };
        const r = await apiSend<RecommendResult>('POST', '/sponsorship-intel/recommend', body);
        setRecResult(r);
      }
    } catch (e) {
      setErr((e as Error).message);
      setRecResult(null);
    } finally {
      setRecBusy(false);
    }
  }

  async function loadMetrics(id: string) {
    if (!id) { setMetrics(null); setMetricsLoaded(false); return; }
    setMetricsBusy(true);
    setErr(null);
    try {
      const r = await apiGet<{ metrics: Metrics | null }>(
        `/sponsorship-intel/metrics?opportunity=${encodeURIComponent(id)}`,
      );
      const m = r.metrics ?? null;
      setMetrics(m);
      setMetricsLoaded(true);
      setMImpressions(m?.impressions != null ? String(m.impressions) : '');
      setMRevenue(m?.revenue != null ? String(m.revenue) : '');
      setMDemographics(m?.demographics ? JSON.stringify(m.demographics, null, 2) : '');
      setMHistorical(m?.historical_performance ? JSON.stringify(m.historical_performance, null, 2) : '');
      setMAssets(m?.asset_availability ? JSON.stringify(m.asset_availability, null, 2) : '');
    } catch (e) {
      setErr((e as Error).message);
      setMetrics(null);
      setMetricsLoaded(false);
    } finally {
      setMetricsBusy(false);
    }
  }

  function parseJson(label: string, raw: string): unknown {
    const t = raw.trim();
    if (!t) return undefined;
    try {
      return JSON.parse(t);
    } catch {
      throw new Error(`${label} must be valid JSON`);
    }
  }

  async function saveMetrics() {
    if (!opportunityId.trim()) { setErr('Enter an opportunity id'); return; }
    setMetricsBusy(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        opportunity_id: opportunityId.trim(),
        impressions: num(mImpressions),
        revenue: num(mRevenue),
        demographics: parseJson('Demographics', mDemographics) ?? null,
        historical_performance: parseJson('Historical performance', mHistorical) ?? null,
        asset_availability: parseJson('Asset availability', mAssets) ?? null,
      };
      const r = await apiSend<{ metrics: Metrics }>('PUT', '/sponsorship-intel/metrics', body);
      setMetrics(r.metrics);
      setMetricsLoaded(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setMetricsBusy(false);
    }
  }

  useEffect(() => { setRecResult(null); }, [recMode]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sponsorship Intelligence</h1>
          <div className="sub">Impressions, demographics, performance, revenue, and asset availability</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={'btn' + (mode === 'recommend' ? ' primary' : '')} onClick={() => setMode('recommend')}>Recommend</button>
          <button className={'btn' + (mode === 'metrics' ? ' primary' : '')} onClick={() => setMode('metrics')}>Metrics</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 280px' }}>
            <div className="note" style={{ marginBottom: 6 }}>Venue ID</div>
            <input value={venueInput} onChange={(e) => setVenueInput(e.target.value)} placeholder="Paste the venue id" style={{ width: '100%' }} />
          </label>
          <button className="btn" onClick={applyVenue}>Use venue</button>
        </div>
      </div>

      {err && <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>}

      {mode === 'recommend' ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className={'btn' + (recMode === 'event' ? ' primary' : '')} onClick={() => setRecMode('event')}>For an event</button>
              <button className={'btn' + (recMode === 'brand' ? ' primary' : '')} onClick={() => setRecMode('brand')}>Match a brand</button>
            </div>
            <div className="grid cards2" style={{ gap: 12 }}>
              {recMode === 'event' ? (
                <>
                  <label>
                    <div className="note" style={{ marginBottom: 6 }}>Venue type</div>
                    <input value={venueType} onChange={(e) => setVenueType(e.target.value)} style={{ width: '100%' }} placeholder="hotel, arena, rooftop" />
                  </label>
                  <label>
                    <div className="note" style={{ marginBottom: 6 }}>Event type</div>
                    <input value={eventType} onChange={(e) => setEventType(e.target.value)} style={{ width: '100%' }} placeholder="gala, conference, launch" />
                  </label>
                  <label>
                    <div className="note" style={{ marginBottom: 6 }}>Budget</div>
                    <input value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: '100%' }} placeholder="50000" inputMode="decimal" />
                  </label>
                  <label>
                    <div className="note" style={{ marginBottom: 6 }}>Guest count</div>
                    <input value={guestCount} onChange={(e) => setGuestCount(e.target.value)} style={{ width: '100%' }} placeholder="500" inputMode="numeric" />
                  </label>
                  <label style={{ gridColumn: '1 / -1' }}>
                    <div className="note" style={{ marginBottom: 6 }}>Target audience (optional)</div>
                    <input value={audience} onChange={(e) => setAudience(e.target.value)} style={{ width: '100%' }} placeholder="luxury, tech, families" />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    <div className="note" style={{ marginBottom: 6 }}>Brand audience</div>
                    <input value={audience} onChange={(e) => setAudience(e.target.value)} style={{ width: '100%' }} placeholder="luxury, tech, sports" />
                  </label>
                  <label>
                    <div className="note" style={{ marginBottom: 6 }}>Budget</div>
                    <input value={budget} onChange={(e) => setBudget(e.target.value)} style={{ width: '100%' }} placeholder="50000" inputMode="decimal" />
                  </label>
                  <label>
                    <div className="note" style={{ marginBottom: 6 }}>Category (optional)</div>
                    <select value={brandCategory} onChange={(e) => setBrandCategory(e.target.value)} style={{ width: '100%' }}>
                      <option value="">Any</option>
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                    </select>
                  </label>
                  <label>
                    <div className="note" style={{ marginBottom: 6 }}>Min impressions (optional)</div>
                    <input value={minImpressions} onChange={(e) => setMinImpressions(e.target.value)} style={{ width: '100%' }} placeholder="100000" inputMode="numeric" />
                  </label>
                </>
              )}
            </div>
            <div style={{ marginTop: 14 }}>
              <button className="btn primary" onClick={runRecommend} disabled={recBusy}>{recBusy ? 'Scoring...' : 'Recommend'}</button>
            </div>
          </div>

          {recResult && (
            <>
              <div className="grid cards3 kpi" style={{ marginBottom: 16 }}>
                <div className="card metric"><div className="k">Recommended</div><div className="v">{recResult.rollup.count}</div><div className="d">opportunities</div></div>
                <div className="card metric"><div className="k">Estimated impressions</div><div className="v" style={{ fontSize: 22 }}>{count(recResult.rollup.estimated_impressions)}</div><div className="d">across set</div></div>
                <div className="card metric"><div className="k">Estimated revenue</div><div className="v" style={{ fontSize: 22 }}>{money(recResult.rollup.estimated_revenue)}</div><div className="d">across set</div></div>
              </div>

              {recResult.recommendations.length === 0 ? (
                <div className="card"><p className="note" style={{ margin: 0 }}>No matching open opportunities. Try widening the brief.</p></div>
              ) : (
                <div className="grid cards2">
                  {recResult.recommendations.map((r) => (
                    <div className="card" key={r.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <h3 style={{ margin: 0 }}>{r.name}</h3>
                        <span className="note" style={{ fontWeight: 700, fontSize: 18 }}>{r.score}</span>
                      </div>
                      <div className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px', marginTop: 2 }}>{r.category ?? 'other'}</div>
                      <div className="note" style={{ lineHeight: 1.7, marginTop: 8 }}>
                        <div>Price: {r.price != null ? money(r.price) : '-'}</div>
                        <div>Est. impressions: {count(r.estimated_impressions)}</div>
                        <div>Est. revenue: {money(r.estimated_revenue)}</div>
                      </div>
                      <div className="note" style={{ marginTop: 10 }}>
                        {r.reasons.map((reason, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span>{reason.label}</span>
                            <span>{Math.round(reason.value * 100)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ flex: '1 1 280px' }}>
                <div className="note" style={{ marginBottom: 6 }}>Sponsorship opportunity ID</div>
                <input value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)} placeholder="Paste the opportunity id" style={{ width: '100%' }} />
              </label>
              <button className="btn" onClick={() => loadMetrics(opportunityId.trim())} disabled={metricsBusy}>Load metrics</button>
            </div>
            <p className="note" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
              Capture the intelligence behind a packaged sponsorship: total impressions,
              audience demographics, historical performance, revenue, and which assets
              are still available. Demographics, historical performance, and asset
              availability accept JSON.
            </p>
          </div>

          {metricsLoaded && metrics && (
            <div className="grid cards3 kpi" style={{ marginBottom: 16 }}>
              <div className="card metric"><div className="k">Impressions</div><div className="v" style={{ fontSize: 22 }}>{count(metrics.impressions)}</div><div className="d">measured</div></div>
              <div className="card metric"><div className="k">Revenue</div><div className="v" style={{ fontSize: 22 }}>{money(metrics.revenue)}</div><div className="d">to date</div></div>
              <div className="card metric"><div className="k">Asset availability</div><div className="v" style={{ fontSize: 14 }}>{jsonLines(metrics.asset_availability)[0] ?? '-'}</div><div className="d">open vs reserved</div></div>
            </div>
          )}

          <div className="card">
            <div className="sectitle">{metricsLoaded ? 'Edit metrics' : 'Metrics'}</div>
            <div className="grid cards2" style={{ gap: 12 }}>
              <label>
                <div className="note" style={{ marginBottom: 6 }}>Impressions</div>
                <input value={mImpressions} onChange={(e) => setMImpressions(e.target.value)} style={{ width: '100%' }} placeholder="250000" inputMode="numeric" />
              </label>
              <label>
                <div className="note" style={{ marginBottom: 6 }}>Revenue</div>
                <input value={mRevenue} onChange={(e) => setMRevenue(e.target.value)} style={{ width: '100%' }} placeholder="35000" inputMode="decimal" />
              </label>
            </div>
            <label style={{ display: 'block', marginTop: 12 }}>
              <div className="note" style={{ marginBottom: 6 }}>Demographics (JSON)</div>
              <textarea value={mDemographics} onChange={(e) => setMDemographics(e.target.value)} style={{ width: '100%', minHeight: 70, fontFamily: 'monospace' }} placeholder={'{ "age_25_44": 0.6, "hhi_100k_plus": 0.5 }'} />
            </label>
            <label style={{ display: 'block', marginTop: 12 }}>
              <div className="note" style={{ marginBottom: 6 }}>Historical performance (JSON)</div>
              <textarea value={mHistorical} onChange={(e) => setMHistorical(e.target.value)} style={{ width: '100%', minHeight: 70, fontFamily: 'monospace' }} placeholder={'{ "sell_through": 0.9, "renewal_rate": 0.8, "satisfaction": 4.6, "runs": 3 }'} />
            </label>
            <label style={{ display: 'block', marginTop: 12 }}>
              <div className="note" style={{ marginBottom: 6 }}>Asset availability (JSON)</div>
              <textarea value={mAssets} onChange={(e) => setMAssets(e.target.value)} style={{ width: '100%', minHeight: 70, fontFamily: 'monospace' }} placeholder={'{ "open": 3, "total": 4 }'} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn primary" onClick={saveMetrics} disabled={metricsBusy}>{metricsBusy ? 'Saving...' : 'Save metrics'}</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
