import React, { useEffect, useState, useCallback } from 'react';
import { apiGet, apiBlob } from '../../../lib/api';

/**
 * Banquet Event Order (BEO) tab (moat roadmap Phase 2c, 2026-08-14). The
 * hospitality-industry-standard document: event overview, venue setup/
 * access, run of show, and what is actually ordered from each awarded
 * vendor with real pricing. Assembled server-side from the event's real
 * data (server/src/db/beo.ts) -- never fabricated.
 *
 * Zero em dashes.
 */

type BeoLineItem = { description: string; amount: number };
type BeoVendorOrder = {
  contract_id: string;
  vendor_name: string;
  category: string | null;
  awarded_amount: string;
  line_items: BeoLineItem[];
};
type BeoScheduleItem = { key: string; title: string; start_time: string | null; end_time: string | null; location: string | null };
type Beo = {
  event: { name: string; date_time: string | null; timezone: string | null };
  venue: { name: string | null; space: string | null; access_time: string | null; notes: string | null; restrictions: string | null };
  schedule: BeoScheduleItem[];
  vendor_orders: BeoVendorOrder[];
};

function money(v: string | number | null | undefined): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v ?? 0));
}

function fmt(v: string | null): string {
  if (!v) return 'TBD';
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
  } catch {
    return v;
  }
}

export default function BeoTab({ eventId }: { eventId: string }) {
  const [beo, setBeo] = useState<Beo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const blob = await apiBlob(`/events/${eventId}/beo/pdf`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  }

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ beo: Beo }>(`/events/${eventId}/beo`)
      .then((r) => setBeo(r.beo))
      .catch((e) => setError(e?.message ?? 'Failed to load BEO'))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="ew-muted">Loading Banquet Event Order.</p>;
  if (error) return <p className="ew-error">{error}</p>;
  if (!beo) return null;

  return (
    <div className="ew-beo">
      <style>{BEO_CSS}</style>

      <div className="ew-beo-toolbar">
        <button type="button" className="ew-btn sm" onClick={() => void downloadPdf()} disabled={pdfBusy}>
          {pdfBusy ? 'Preparing...' : 'Download BEO PDF'}
        </button>
      </div>

      <section className="ew-beo-section">
        <h3>Event Overview</h3>
        <p className="ew-beo-line">{beo.event.name} · {fmt(beo.event.date_time)}</p>
      </section>

      <section className="ew-beo-section">
        <h3>Venue Setup / Access</h3>
        {beo.venue.name ? (
          <>
            <p className="ew-beo-line">{beo.venue.name}{beo.venue.space ? ` — ${beo.venue.space}` : ''}</p>
            {beo.venue.access_time ? <p className="ew-beo-muted">Access time: {fmt(beo.venue.access_time)}</p> : null}
            {beo.venue.restrictions ? <p className="ew-beo-muted">{beo.venue.restrictions}</p> : null}
            {beo.venue.notes ? <p className="ew-beo-muted">{beo.venue.notes}</p> : null}
          </>
        ) : (
          <p className="ew-beo-muted">No venue setup/access details recorded yet.</p>
        )}
      </section>

      <section className="ew-beo-section">
        <h3>Run of Show</h3>
        {beo.schedule.length === 0 ? (
          <p className="ew-beo-muted">No schedule items yet.</p>
        ) : (
          <div className="ew-beo-schedule">
            {beo.schedule.map((item) => (
              <div key={item.key} className="ew-beo-schedule-row">
                <span className="ew-beo-when">{item.start_time ? fmt(item.start_time) : 'Time TBD'}</span>
                <span className="ew-beo-what">{item.title}{item.location ? ` — ${item.location}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ew-beo-section">
        <h3>Vendor Orders</h3>
        {beo.vendor_orders.length === 0 ? (
          <p className="ew-beo-muted">No vendor has been awarded on this event yet.</p>
        ) : (
          <div className="ew-beo-vendors">
            {beo.vendor_orders.map((v) => (
              <div key={v.contract_id} className="ew-beo-vendor-card">
                <div className="ew-beo-vendor-top">
                  <strong>{v.vendor_name}{v.category ? ` — ${v.category}` : ''}</strong>
                  <span className="ew-beo-total">{money(v.awarded_amount)}</span>
                </div>
                {v.line_items.length === 0 ? (
                  <p className="ew-beo-muted">No itemized line items on the awarded quote.</p>
                ) : (
                  <ul className="ew-beo-items">
                    {v.line_items.map((li, i) => (
                      <li key={i}>
                        <span>{li.description || 'Item'}</span>
                        <span>{money(li.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const BEO_CSS = `
.ew-beo-toolbar { margin-bottom: 16px; }
.ew-beo-section { background: #fff; border: 1px solid #e7e1d6; border-radius: 14px; padding: 16px 18px; margin-bottom: 14px; }
.ew-beo-section h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 17px; color: #123c2e; margin: 0 0 8px; }
.ew-beo-line { font-size: 13.5px; color: #2c2a26; margin: 0 0 4px; }
.ew-beo-muted { font-size: 12.5px; color: #6b6459; margin: 2px 0; }
.ew-beo-schedule { display: flex; flex-direction: column; gap: 6px; }
.ew-beo-schedule-row { display: flex; gap: 12px; font-size: 12.5px; }
.ew-beo-when { color: #1E5D4A; font-weight: 700; min-width: 140px; }
.ew-beo-what { color: #2c2a26; }
.ew-beo-vendors { display: flex; flex-direction: column; gap: 12px; }
.ew-beo-vendor-card { border: 1px solid #e7e1d6; border-radius: 10px; padding: 12px 14px; }
.ew-beo-vendor-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.ew-beo-vendor-top strong { color: #123c2e; font-size: 14px; }
.ew-beo-total { color: #1E5D4A; font-weight: 700; }
.ew-beo-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.ew-beo-items li { display: flex; justify-content: space-between; font-size: 12.5px; color: #2c2a26; }
`;
