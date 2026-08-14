import React, { useEffect, useState, useCallback } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Instant Book tab (moat roadmap Phase 2c, 2026-08-14): browse every
 * vendor package marked "instant book" and book one against THIS event
 * with a single click, no bid or quote back-and-forth. The backend
 * (server/src/db/quotes.ts::instantBookPackage) creates and immediately
 * awards a real quote through the exact same atomic awardQuote()
 * transaction a negotiated award goes through -- compliance gate
 * included, so a booking can still be blocked if this vendor has an unmet
 * before-award requirement on this event.
 *
 * Zero em dashes.
 */

type BookablePackage = {
  id: string;
  vendor_org_name?: string | null;
  name?: string;
  description?: string;
  category?: string;
  bundle_price?: number;
  items?: { name?: string; quantity?: number; unit_price?: number }[];
  serves?: number;
};

function money(n?: number | string): string {
  const v = Number(n ?? 0) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

function lineTotal(items?: BookablePackage['items']): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 1), 0);
}

export default function InstantBookTab({ eventId }: { eventId: string }) {
  const [packages, setPackages] = useState<BookablePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [bookErr, setBookErr] = useState<string | null>(null);
  const [booked, setBooked] = useState<{ id: string; total?: string } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const qs = category ? `?category=${encodeURIComponent(category)}` : '';
    apiGet<{ packages: BookablePackage[] }>(`/packages/bookable${qs}`)
      .then((r) => setPackages(r.packages ?? []))
      .catch((e) => setError(e?.message ?? 'Failed to load instant-bookable packages'))
      .finally(() => setLoading(false));
  }, [category]);

  useEffect(() => { load(); }, [load]);

  async function book(p: BookablePackage) {
    if (!window.confirm(`Book "${p.name}" from ${p.vendor_org_name || 'this vendor'} now for ${money(p.bundle_price ?? lineTotal(p.items))}? This awards the vendor immediately, no negotiation.`)) return;
    setBookingId(p.id);
    setBookErr(null);
    setBooked(null);
    try {
      const res = await apiSend<{ quote: { id: string; total?: string } }>('POST', `/packages/${p.id}/instant-book`, { event_id: eventId });
      setBooked({ id: res.quote.id, total: res.quote.total });
    } catch (e) {
      setBookErr((e as Error).message);
    } finally {
      setBookingId(null);
    }
  }

  if (loading) return <p className="ew-muted">Loading instant-bookable packages.</p>;
  if (error) return <p className="ew-error">{error}</p>;

  return (
    <div className="ew-ib">
      <style>{IB_CSS}</style>
      <p className="ew-ib-intro">
        Book a vendor's fixed-price package directly against this event -- no bid, no back-and-forth. The
        vendor is awarded immediately and a contract is created, exactly as if you had accepted their quote.
      </p>
      {bookErr ? <p className="ew-error">{bookErr}</p> : null}
      {booked ? (
        <p className="ew-ib-ok">Booked. Quote {booked.id.slice(0, 8)} awarded for {money(booked.total)}. See the Quotes tab for the contract.</p>
      ) : null}

      <div className="ew-ib-toolbar">
        <input
          className="ew-ib-input"
          placeholder="Filter by category (e.g. catering)"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
      </div>

      {packages.length === 0 ? (
        <div className="ew-empty">
          <p>No instant-bookable packages available right now. Vendors opt individual packages into instant book from Package Builder.</p>
        </div>
      ) : (
        <div className="ew-ib-list">
          {packages.map((p) => (
            <div key={p.id} className="ew-ib-card">
              <div className="ew-ib-top">
                <h3 className="ew-ib-title">{p.name || 'Untitled package'}</h3>
                {p.category ? <span className="ew-ib-cat">{p.category}</span> : null}
              </div>
              <p className="ew-ib-vendor">{p.vendor_org_name || 'Vendor'}</p>
              {p.description ? <p className="ew-ib-desc">{p.description}</p> : null}
              <p className="ew-ib-price">{money(p.bundle_price ?? lineTotal(p.items))}{p.serves ? <span className="ew-ib-serves"> · serves {p.serves}</span> : null}</p>
              <button
                type="button"
                className="ew-btn sm"
                onClick={() => void book(p)}
                disabled={bookingId === p.id}
              >
                {bookingId === p.id ? 'Booking...' : 'Book now'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const IB_CSS = `
.ew-ib-intro { font-size: 13px; color: #6b6459; line-height: 1.5; margin: 0 0 14px; }
.ew-ib-ok { background: #eef6f1; border: 1px solid #cfe6da; color: #123c2e; padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; }
.ew-ib-toolbar { margin-bottom: 14px; }
.ew-ib-input { font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid #e7e1d6; border-radius: 8px; width: 260px; max-width: 100%; }
.ew-ib-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.ew-ib-card { background: #fff; border: 1px solid #e7e1d6; border-radius: 14px; padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
.ew-ib-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ew-ib-title { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 18px; color: #123c2e; margin: 0; }
.ew-ib-cat { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; color: #8a5a12; background: rgba(201,163,91,.16); border: 1px solid rgba(201,163,91,.45); border-radius: 999px; padding: 2px 8px; }
.ew-ib-vendor { font-size: 12px; color: #6b6459; margin: 0; font-weight: 600; }
.ew-ib-desc { font-size: 12.5px; color: #2c2a26; margin: 0; line-height: 1.5; }
.ew-ib-price { font-size: 17px; font-weight: 700; color: #123c2e; margin: 4px 0 6px; }
.ew-ib-serves { font-size: 12px; font-weight: 400; color: #6b6459; }
`;
