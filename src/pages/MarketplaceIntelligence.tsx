import React, { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';

/**
 * Divini AI COO V2 - Marketplace Intelligence.
 *
 * Ecosystem report: popular vendor categories + venues, growing categories,
 * trending event types, sponsor demand, inventory/service demand, and regional
 * trends. Every figure is an AGGREGATE COUNT across the whole marketplace (no
 * per-tenant data, org ids, or money), computed server side via GET
 * /marketplace-intel/report. Graceful empty state before the platform has data.
 */

type RankedCount = { label: string; count: number };

type TrendItem = {
  label: string;
  count: number;
  growth_pct: number | null;
  direction: 'up' | 'down' | 'flat' | 'new';
};

type RegionalTrend = {
  region: string;
  activity: number;
  growth_pct: number | null;
  direction: 'up' | 'down' | 'flat' | 'new';
};

type Report = {
  generated_at: string;
  popularVendors: RankedCount[];
  popularVenues: RankedCount[];
  growingCategories: TrendItem[];
  trendingEventTypes: TrendItem[];
  sponsorDemand: { byCategory: RankedCount[]; open_total: number };
  inventoryDemand: RankedCount[];
  regionalTrends: RegionalTrend[];
};

const ARROW: Record<TrendItem['direction'], string> = {
  up: '▲',
  down: '▼',
  flat: '=',
  new: '★',
};

function growthLabel(t: { growth_pct: number | null; direction: TrendItem['direction'] }): string {
  if (t.direction === 'new') return 'new';
  if (t.growth_pct == null) return ARROW[t.direction];
  return `${ARROW[t.direction]} ${t.growth_pct > 0 ? '+' : ''}${t.growth_pct}%`;
}

function RankList({ rows, unit }: { rows: RankedCount[]; unit: string }) {
  if (rows.length === 0) return <p className="note" style={{ margin: 0 }}>No data yet.</p>;
  return (
    <div className="note" style={{ lineHeight: 1.9 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{r.label}</span>
          <span style={{ fontWeight: 600 }}>{r.count.toLocaleString()} {unit}</span>
        </div>
      ))}
    </div>
  );
}

function TrendList({ rows }: { rows: TrendItem[] }) {
  if (rows.length === 0) return <p className="note" style={{ margin: 0 }}>No data yet.</p>;
  return (
    <div className="note" style={{ lineHeight: 1.9 }}>
      {rows.map((r) => (
        <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <span>{r.label}</span>
          <span style={{ fontWeight: 600 }}>{r.count.toLocaleString()} · {growthLabel(r)}</span>
        </div>
      ))}
    </div>
  );
}

export default function MarketplaceIntelligence() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await apiGet<{ report: Report }>('/marketplace-intel/report');
        if (alive) setReport(r.report);
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

  const hasData =
    report &&
    (report.popularVendors.length > 0 ||
      report.popularVenues.length > 0 ||
      report.growingCategories.length > 0 ||
      report.trendingEventTypes.length > 0 ||
      report.sponsorDemand.byCategory.length > 0 ||
      report.sponsorDemand.open_total > 0 ||
      report.inventoryDemand.length > 0 ||
      report.regionalTrends.length > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Marketplace Intelligence</h1>
          <div className="sub">Ecosystem-wide trends - aggregate counts only, no per-tenant data</div>
        </div>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Reading the marketplace...</p></div>
      ) : !hasData ? (
        <div className="card">
          <p className="note" style={{ margin: 0, lineHeight: 1.7 }}>
            The marketplace report is empty for now. As vendors, venues, events, quotes, and
            sponsorships accumulate across the ecosystem, this page will surface the most popular
            vendor categories and venues, which categories and event types are growing, where
            sponsorship and inventory demand is concentrated, and regional activity trends - all as
            aggregate counts across the whole platform.
          </p>
        </div>
      ) : (
        <>
          {report!.sponsorDemand.open_total > 0 && (
            <div className="grid cards3 kpi" style={{ marginBottom: 16 }}>
              <div className="card metric">
                <div className="k">Open sponsorships</div>
                <div className="v">{report!.sponsorDemand.open_total.toLocaleString()}</div>
                <div className="d">across the ecosystem</div>
              </div>
              <div className="card metric">
                <div className="k">Growing categories</div>
                <div className="v">{report!.growingCategories.filter((c) => c.direction === 'up' || c.direction === 'new').length}</div>
                <div className="d">trending up</div>
              </div>
              <div className="card metric">
                <div className="k">Active regions</div>
                <div className="v">{report!.regionalTrends.length}</div>
                <div className="d">with event activity</div>
              </div>
            </div>
          )}

          <div className="grid cards2" style={{ gap: 16 }}>
            <div className="card">
              <div className="sectitle">Popular vendor categories</div>
              <RankList rows={report!.popularVendors} unit="engagements" />
            </div>
            <div className="card">
              <div className="sectitle">Popular venues</div>
              <RankList rows={report!.popularVenues} unit="events" />
            </div>
            <div className="card">
              <div className="sectitle">Growing categories</div>
              <TrendList rows={report!.growingCategories} />
            </div>
            <div className="card">
              <div className="sectitle">Trending event types</div>
              <TrendList rows={report!.trendingEventTypes} />
            </div>
            <div className="card">
              <div className="sectitle">Sponsor demand</div>
              <RankList rows={report!.sponsorDemand.byCategory} unit="open" />
            </div>
            <div className="card">
              <div className="sectitle">Inventory / service demand</div>
              <RankList rows={report!.inventoryDemand} unit="requests" />
            </div>
            <div className="card" style={{ gridColumn: '1 / -1' }}>
              <div className="sectitle">Regional trends</div>
              {report!.regionalTrends.length === 0 ? (
                <p className="note" style={{ margin: 0 }}>No data yet.</p>
              ) : (
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Region</th>
                      <th>Activity</th>
                      <th>Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report!.regionalTrends.map((r) => (
                      <tr key={r.region}>
                        <td>{r.region}</td>
                        <td>{r.activity.toLocaleString()}</td>
                        <td>{growthLabel(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
