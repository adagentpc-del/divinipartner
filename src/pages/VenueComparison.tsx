import { useState } from 'react';
import { apiSend } from '../lib/api';

/**
 * Friction Elimination - UPGRADE 3 Venue Comparison Engine (in-app surface).
 *
 * Enter one venue id per line, run the comparison, and read a side-by-side table
 * of the venues: capacity, parking, AV/tables/furniture included, security,
 * vendor restriction count, F&B minimum, insurance, setup/teardown windows, and
 * the Estimated Total Cost (the highlighted row). Talks to POST
 * /api/venue-compare/compare via src/lib/api.ts. Deterministic server-side; this
 * page only renders what the engine returns.
 */

type CostLineItem = { key: string; label: string; amount: number };
type CostEstimate = { total: number; lineItems: CostLineItem[]; guestCount: number; assumed: boolean };

type ComparisonRow = {
  venueId: string;
  name: string | null;
  location: string | null;
  venueType: string | null;
  capacity: number | null;
  indoorCapacity: number | null;
  outdoorCapacity: number | null;
  parkingCapacity: number | null;
  reviewScore: number | null;
  avIncluded: boolean | null;
  tablesIncluded: boolean | null;
  furnitureIncluded: boolean | null;
  securityRequired: boolean | null;
  insuranceRequired: boolean | null;
  fnbMinimum: number | null;
  rentalCost: number | null;
  vendorRestrictionCount: number;
  setupWindow: unknown;
  teardownWindow: unknown;
  extras: unknown;
  estimate: CostEstimate;
};

function money(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return '$' + Math.round(n).toLocaleString('en-US');
}

function yesNo(v: boolean | null | undefined): string {
  if (v === null || v === undefined) return '-';
  return v ? 'Yes' : 'No';
}

function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return '-';
  return n.toLocaleString('en-US');
}

function windowText(w: unknown): string {
  if (w === null || w === undefined) return '-';
  if (typeof w === 'string') return w;
  if (typeof w === 'object') {
    const o = w as Record<string, unknown>;
    if (typeof o.hours === 'number' || typeof o.hours === 'string') return `${o.hours} hrs`;
    if (typeof o.notes === 'string') return o.notes;
    try {
      return JSON.stringify(o);
    } catch {
      return '-';
    }
  }
  return String(w);
}

export default function VenueComparison() {
  const [idsText, setIdsText] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ran, setRan] = useState(false);

  async function runCompare() {
    const venueIds = idsText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (venueIds.length === 0) {
      setError('Enter at least one venue id.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const gc = guestCount.trim() ? Number(guestCount.trim()) : null;
      const res = await apiSend<{ rows: ComparisonRow[] }>('POST', '/venue-compare/compare', {
        venueIds,
        inputs: { guestCount: Number.isFinite(gc as number) ? gc : null },
      });
      setRows(res.rows ?? []);
      setRan(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed.');
    } finally {
      setLoading(false);
    }
  }

  const ROWS: { label: string; render: (r: ComparisonRow) => string; total?: boolean }[] = [
    { label: 'Location', render: (r) => r.location ?? '-' },
    { label: 'Type', render: (r) => r.venueType ?? '-' },
    { label: 'Review score', render: (r) => (r.reviewScore === null ? '-' : r.reviewScore.toFixed(1)) },
    { label: 'Capacity', render: (r) => num(r.capacity) },
    { label: 'Indoor capacity', render: (r) => num(r.indoorCapacity) },
    { label: 'Outdoor capacity', render: (r) => num(r.outdoorCapacity) },
    { label: 'Parking', render: (r) => num(r.parkingCapacity) },
    { label: 'AV included', render: (r) => yesNo(r.avIncluded) },
    { label: 'Tables included', render: (r) => yesNo(r.tablesIncluded) },
    { label: 'Furniture included', render: (r) => yesNo(r.furnitureIncluded) },
    { label: 'Security required', render: (r) => yesNo(r.securityRequired) },
    { label: 'Insurance required', render: (r) => yesNo(r.insuranceRequired) },
    { label: 'Vendor restrictions', render: (r) => String(r.vendorRestrictionCount) },
    { label: 'F&B minimum', render: (r) => money(r.fnbMinimum) },
    { label: 'Rental / facility fee', render: (r) => money(r.rentalCost) },
    { label: 'Setup window', render: (r) => windowText(r.setupWindow) },
    { label: 'Teardown window', render: (r) => windowText(r.teardownWindow) },
    { label: 'Estimated total cost', render: (r) => money(r.estimate?.total), total: true },
  ];

  return (
    <>
      <style>{`
        .vc-table{width:100%;border-collapse:collapse;font-size:14px}
        .vc-table th,.vc-table td{border:1px solid var(--line,#e5e0d6);padding:10px 12px;text-align:left;vertical-align:top}
        .vc-table th.vc-rowlabel{background:var(--ivory,#f7f4ee);font-weight:600;white-space:nowrap;width:200px}
        .vc-table thead th{background:var(--ivory,#f7f4ee);font-weight:700}
        .vc-table tr.vc-total th,.vc-table tr.vc-total td{background:var(--champagne,#e9e2d2);font-weight:700;font-size:15px}
        .vc-assumed{font-size:11px;color:var(--muted,#8a8475);font-weight:500}
        .vc-wrap{overflow-x:auto}
      `}</style>

      <div className="page-head">
        <div>
          <h1>Venue Comparison</h1>
          <div className="sub">Compare venues side by side, including an estimated total cost.</div>
        </div>
        <button className="btn primary" onClick={runCompare} disabled={loading}>
          {loading ? 'Comparing...' : 'Compare venues'}
        </button>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: 6 }}>Venue IDs</label>
        <textarea
          value={idsText}
          onChange={(e) => setIdsText(e.target.value)}
          placeholder="One venue id per line (or comma / space separated)"
          rows={4}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 10, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <label style={{ fontWeight: 600 }}>Expected guests (optional)</label>
          <input
            value={guestCount}
            onChange={(e) => setGuestCount(e.target.value)}
            placeholder="e.g. 150"
            inputMode="numeric"
            style={{ width: 120, padding: 8 }}
          />
          <span className="note" style={{ fontSize: 12 }}>
            Drives the per-guest vendor / furniture allowances in the estimate.
          </span>
        </div>
      </div>

      {error && (
        <div className="card" style={{ marginBottom: 18, borderColor: '#c0392b', color: '#c0392b' }}>
          {error}
        </div>
      )}

      {ran && rows.length === 0 && !error && (
        <div className="card">
          <p className="note" style={{ margin: 0 }}>
            No comparable venues found. Check the ids, or confirm you have access to them.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="card vc-wrap">
          <table className="vc-table">
            <thead>
              <tr>
                <th className="vc-rowlabel">Attribute</th>
                {rows.map((r) => (
                  <th key={r.venueId}>
                    {r.name ?? r.venueId}
                    {r.estimate?.assumed && (
                      <div className="vc-assumed">
                        est. based on {r.estimate.guestCount} guests
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.label} className={row.total ? 'vc-total' : undefined}>
                  <th className="vc-rowlabel">{row.label}</th>
                  {rows.map((r) => (
                    <td key={r.venueId + row.label}>{row.render(r)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
