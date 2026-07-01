import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

type Quote = {
  id: string;
  bid_id: string | null;
  subtotal: string | null;
  platform_fee: string | null;
  total: string | null;
  status: string | null;
  expiration_date: string | null;
  created_at: string;
};
type Standardized = {
  quote_id: string;
  status: string | null;
  brand: { platform: string; vendor: string; vendor_category: string | null };
  event: { name: string; date_time: string | null };
  line_items: {
    services: { label: string; amount?: number }[];
    rentals: { label: string; amount?: number }[];
    add_ons: { label: string; amount?: number }[];
    exclusions: { label: string }[];
  };
  totals: { subtotal: string | null; platform_fee: string | null; total: string | null };
  expiration_date: string | null;
  actions: string[];
};

function money(v: string | null | undefined): string {
  if (v == null) return '-';
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toLocaleString()}` : String(v);
}

export default function QuotesTab({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Quote[]>([]);
  const [open, setOpen] = useState<Standardized | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const r = await apiGet<{ quotes: Quote[] }>(`/quotes/event/${eventId}`);
      setRows(r.quotes);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);

  async function view(id: string) {
    setErr(null);
    try {
      const r = await apiGet<{ quote: Standardized }>(`/quotes/${id}/standardized`);
      setOpen(r.quote);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function act(id: string, action: 'accept' | 'decline' | 'request-revision') {
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', `/quotes/${id}/${action}`);
      setOpen(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <style>{Q_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      {rows.length === 0 ? (
        <div className="ew-empty"><p>No quotes received yet. Quotes from vendors appear here once submitted.</p></div>
      ) : (
        <table className="ew-table">
          <thead>
            <tr><th>Quote</th><th>Subtotal</th><th>Platform fee</th><th>Total</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.id}>
                <td className="ew-mono">{q.id.slice(0, 8)}</td>
                <td>{money(q.subtotal)}</td>
                <td>{money(q.platform_fee)}</td>
                <td>{money(q.total)}</td>
                <td>{q.status}</td>
                <td><button type="button" className="ew-btn ghost sm" onClick={() => view(q.id)}>View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open ? (
        <div className="ew-q-modal" role="dialog" aria-modal="true">
          <div className="ew-q-card">
            <div className="ew-q-head">
              <div>
                <div className="ew-q-brandtop">{open.brand.platform}</div>
                <div className="ew-q-vendor">{open.brand.vendor}{open.brand.vendor_category ? ` - ${open.brand.vendor_category}` : ''}</div>
              </div>
              <button type="button" className="ew-q-close" onClick={() => setOpen(null)}>Close</button>
            </div>
            <div className="ew-q-event">{open.event.name}</div>

            <QSection title="Services" items={open.line_items.services} />
            <QSection title="Rentals" items={open.line_items.rentals} />
            <QSection title="Add-ons" items={open.line_items.add_ons} />
            {open.line_items.exclusions.length ? (
              <div className="ew-q-excl">
                <div className="ew-q-secttitle">Exclusions</div>
                <ul>{open.line_items.exclusions.map((x, i) => <li key={i}>{x.label}</li>)}</ul>
              </div>
            ) : null}

            <div className="ew-q-totals">
              <div><span>Subtotal</span><span>{money(open.totals.subtotal)}</span></div>
              <div><span>Platform fee</span><span>{money(open.totals.platform_fee)}</span></div>
              <div className="ew-q-grand"><span>Total</span><span>{money(open.totals.total)}</span></div>
            </div>
            {open.expiration_date ? <p className="ew-q-exp">Expires {new Date(open.expiration_date).toLocaleDateString()}</p> : null}

            <div className="ew-q-actions">
              <button type="button" className="ew-btn" disabled={busy} onClick={() => act(open.quote_id, 'accept')}>Accept</button>
              <button type="button" className="ew-btn ghost" disabled={busy} onClick={() => act(open.quote_id, 'request-revision')}>Request revision</button>
              <button type="button" className="ew-btn danger" disabled={busy} onClick={() => act(open.quote_id, 'decline')}>Decline</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function QSection({ title, items }: { title: string; items: { label: string; amount?: number }[] }) {
  if (!items.length) return null;
  return (
    <div className="ew-q-sect">
      <div className="ew-q-secttitle">{title}</div>
      {items.map((li, i) => (
        <div key={i} className="ew-q-li"><span>{li.label}</span><span>{li.amount != null ? `$${li.amount.toLocaleString()}` : ''}</span></div>
      ))}
    </div>
  );
}

const Q_CSS = `
.ew-q-modal { position: fixed; inset: 0; background: rgba(18,30,24,.5); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
.ew-q-card { background: #fff; border-radius: 16px; max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 24px; border: 1px solid #e7e1d6; }
.ew-q-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e7e1d6; padding-bottom: 14px; }
.ew-q-brandtop { font-size: 10.5px; letter-spacing: 1px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; }
.ew-q-vendor { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 24px; color: #123c2e; }
.ew-q-close { background: transparent; border: 1px solid #e7e1d6; border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 12px; cursor: pointer; color: #7d776c; }
.ew-q-event { font-size: 13px; color: #7d776c; margin: 10px 0 16px; }
.ew-q-sect, .ew-q-excl { margin-bottom: 14px; }
.ew-q-secttitle { font-size: 11px; letter-spacing: .6px; text-transform: uppercase; color: #9a8a5e; font-weight: 600; margin-bottom: 6px; }
.ew-q-li { display: flex; justify-content: space-between; font-size: 13px; color: #2c2a26; padding: 4px 0; border-bottom: 1px dashed #efe9dd; }
.ew-q-excl ul { margin: 0; padding-left: 18px; font-size: 12.5px; color: #7d776c; }
.ew-q-totals { background: rgba(247,244,238,.7); border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
.ew-q-totals > div { display: flex; justify-content: space-between; font-size: 13px; color: #4a463e; padding: 3px 0; }
.ew-q-grand { font-weight: 700; color: #123c2e !important; font-size: 16px !important; border-top: 1px solid #e7e1d6; margin-top: 6px; padding-top: 8px !important; }
.ew-q-exp { font-size: 11.5px; color: #a8631a; margin: 0 0 14px; }
.ew-q-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.ew-btn.danger { background: #8a3a3a; }
.ew-btn.danger:hover { background: #743030; }
`;
