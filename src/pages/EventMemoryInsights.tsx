import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

/**
 * Intelligence Moat - F1 Event Memory Insights.
 *
 * Surfaces the compounding learning across past event_memory snapshots for a
 * venue and/or event type: "hosted N similar events", averages (guests, budget,
 * revenue, install/teardown time, rating), outcome distribution, and the best
 * vendor combinations seen across those events. Reads GET /event-memory/insights.
 *
 * It can also (re)build the snapshot for a single event via
 * POST /event-memory/record/:eventId, which is what populates the corpus this
 * page learns from.
 */

type VendorCombo = {
  vendors: string[];
  count: number;
  avg_revenue: number | null;
  avg_rating: number | null;
};

type Insights = {
  count: number;
  headline: string;
  averages: {
    guest_count: number | null;
    budget: number | null;
    revenue: number | null;
    install_minutes: number | null;
    teardown_minutes: number | null;
    rating: number | null;
  };
  outcome_counts: Record<string, number>;
  best_vendor_combinations: VendorCombo[];
};

type InsightsResult = { insights: Insights; sample: number; filter: { eventType: string | null; venueId: string | null } };

const VENUE_KEY = 'dp.vi.venueId';

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

function minutes(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '-';
  return `${Math.round(n)} min`;
}

export default function EventMemoryInsights() {
  const [params, setParams] = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const initialVenue = params.get('venueId') || localStorage.getItem(VENUE_KEY) || '';
  const [venueId, setVenueId] = useState<string>(initialVenue);
  const [eventType, setEventType] = useState<string>(params.get('eventType') || '');
  const [result, setResult] = useState<InsightsResult | null>(null);

  // Snapshot recorder
  const [recordEventId, setRecordEventId] = useState('');
  const [recordMsg, setRecordMsg] = useState<string | null>(null);
  const [recordBusy, setRecordBusy] = useState(false);

  async function runInsights() {
    setBusy(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (eventType.trim()) qs.set('eventType', eventType.trim());
      if (venueId.trim()) {
        qs.set('venueId', venueId.trim());
        localStorage.setItem(VENUE_KEY, venueId.trim());
      }
      setParams(qs);
      const r = await apiGet<InsightsResult>(`/event-memory/insights?${qs.toString()}`);
      setResult(r);
    } catch (e) {
      setErr((e as Error).message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  async function recordSnapshot() {
    if (!recordEventId.trim()) { setErr('Enter an event id to record its memory'); return; }
    setRecordBusy(true);
    setErr(null);
    setRecordMsg(null);
    try {
      await apiSend('POST', `/event-memory/record/${encodeURIComponent(recordEventId.trim())}`);
      setRecordMsg('Snapshot recorded. Re-run insights to include it.');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRecordBusy(false);
    }
  }

  const ins = result?.insights;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Event Memory Insights</h1>
          <div className="sub">What past events teach us: averages, outcomes, and best vendor combinations</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid cards2" style={{ gap: 12 }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Event type</div>
            <input value={eventType} onChange={(e) => setEventType(e.target.value)} style={{ width: '100%' }} placeholder="gala, conference, launch" />
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Venue ID (optional)</div>
            <input value={venueId} onChange={(e) => setVenueId(e.target.value)} style={{ width: '100%' }} placeholder="Paste the venue id" />
          </label>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn primary" onClick={runInsights} disabled={busy}>{busy ? 'Surfacing...' : 'Surface insights'}</button>
        </div>
        <p className="note" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          Leave a field blank to widen the comparison. With no filters, this looks
          across every recorded event memory.
        </p>
      </div>

      {err && <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>}

      {ins && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>{ins.headline}</h3>
            <div className="note" style={{ marginTop: 4 }}>Based on {result?.sample ?? ins.count} recorded snapshot{(result?.sample ?? ins.count) === 1 ? '' : 's'}.</div>
          </div>

          <div className="grid cards3 kpi" style={{ marginBottom: 16 }}>
            <div className="card metric"><div className="k">Avg guests</div><div className="v">{count(ins.averages.guest_count)}</div><div className="d">per event</div></div>
            <div className="card metric"><div className="k">Avg budget</div><div className="v" style={{ fontSize: 22 }}>{money(ins.averages.budget)}</div><div className="d">planned</div></div>
            <div className="card metric"><div className="k">Avg revenue</div><div className="v" style={{ fontSize: 22 }}>{money(ins.averages.revenue)}</div><div className="d">realized</div></div>
            <div className="card metric"><div className="k">Avg install</div><div className="v" style={{ fontSize: 18 }}>{minutes(ins.averages.install_minutes)}</div><div className="d">setup time</div></div>
            <div className="card metric"><div className="k">Avg teardown</div><div className="v" style={{ fontSize: 18 }}>{minutes(ins.averages.teardown_minutes)}</div><div className="d">removal time</div></div>
            <div className="card metric"><div className="k">Avg rating</div><div className="v">{ins.averages.rating != null ? `${ins.averages.rating}/5` : '-'}</div><div className="d">reviews</div></div>
          </div>

          <div className="grid cards2" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="sectitle">Outcomes</div>
              {Object.keys(ins.outcome_counts).length === 0 ? (
                <p className="note" style={{ margin: 0 }}>No outcomes recorded.</p>
              ) : (
                <div className="note" style={{ lineHeight: 1.9 }}>
                  {Object.entries(ins.outcome_counts).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                      <span style={{ fontWeight: 700 }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card">
              <div className="sectitle">Best vendor combinations</div>
              {ins.best_vendor_combinations.length === 0 ? (
                <p className="note" style={{ margin: 0 }}>Not enough multi-vendor events yet.</p>
              ) : (
                <div className="note" style={{ lineHeight: 1.7 }}>
                  {ins.best_vendor_combinations.map((c, i) => (
                    <div key={i} style={{ marginBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{c.vendors.join(' + ')}</div>
                      <div>Paired on {c.count} event{c.count === 1 ? '' : 's'}{c.avg_revenue != null ? `, avg revenue ${money(c.avg_revenue)}` : ''}{c.avg_rating != null ? `, avg rating ${c.avg_rating}/5` : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div className="card">
        <div className="sectitle">Record an event snapshot</div>
        <p className="note" style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
          Capture a completed event into the memory corpus. The snapshot is built
          from the event record, its vendors, quotes, invoices, payments, reviews,
          change orders, installations, and venue sponsorships.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 280px' }}>
            <div className="note" style={{ marginBottom: 6 }}>Event ID</div>
            <input value={recordEventId} onChange={(e) => setRecordEventId(e.target.value)} placeholder="Paste the event id" style={{ width: '100%' }} />
          </label>
          <button className="btn" onClick={recordSnapshot} disabled={recordBusy}>{recordBusy ? 'Recording...' : 'Record snapshot'}</button>
        </div>
        {recordMsg && <p className="note" style={{ margin: '10px 0 0', color: '#1e7e34' }}>{recordMsg}</p>}
      </div>
    </>
  );
}
