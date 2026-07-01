import React, { useEffect, useState, useCallback } from 'react';
import { apiGet } from '../../../lib/api';

/**
 * Change Orders tab. The standalone ChangeOrders page reads its event from the
 * ?event_id query param, which the workspace route (/events/:id) does not carry.
 * This wrapper reuses the same data shape and card markup but takes the event id
 * from the workspace prop and filters via GET /change-orders?event_id=. Graceful
 * empty state per event. Zero em dashes.
 */

type ChangeOrder = {
  id: string;
  change_order_number: string | null;
  title: string | null;
  description: string | null;
  reason: string | null;
  amount: string | null;
  subtotal: string | null;
  platform_fee: string | null;
  status: string | null;
  scope_creep_flag: boolean;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined',
  revision_requested: 'Revision requested', added_to_invoice: 'Added to invoice',
  paid: 'Paid', closed: 'Closed',
};

function money(v: string | null | undefined): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v ?? 0));
}

export default function ChangeOrdersTab({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ change_orders: ChangeOrder[] }>(`/change-orders?event_id=${encodeURIComponent(eventId)}`)
      .then((r) => setRows(r.change_orders ?? []))
      .catch((e) => setError(e?.message ?? 'Failed to load change orders'))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="ew-muted">Loading change orders...</p>;
  if (error) return <p className="ew-error">{error}</p>;
  if (rows.length === 0) {
    return (
      <div className="ew-empty">
        <p>No change orders for this event. Create one when scope is added or revised after the original quote.</p>
      </div>
    );
  }

  return (
    <div className="ew-co">
      <style>{CO_CSS}</style>
      <div className="ew-co-list">
        {rows.map((co) => (
          <div key={co.id} className="ew-co-card">
            <div className="ew-co-card-top">
              <div className="ew-co-card-id">
                <span className="ew-co-num">{co.change_order_number ?? co.id.slice(0, 8)}</span>
                {co.scope_creep_flag ? <span className="ew-co-creep">Scope creep</span> : null}
              </div>
              <span className={`ew-co-pill st-${co.status ?? 'draft'}`}>{STATUS_LABELS[co.status ?? 'draft'] ?? co.status}</span>
            </div>
            {co.title ? <h3 className="ew-co-cardtitle">{co.title}</h3> : null}
            {co.description ? <p className="ew-co-desc">{co.description}</p> : null}
            {co.reason ? <p className="ew-co-reason">Reason: {co.reason}</p> : null}
            <div className="ew-co-amounts">
              <span>Subtotal {money(co.subtotal)}</span>
              <span>Platform fee {money(co.platform_fee)}</span>
              <span className="ew-co-total">Total {money(co.amount)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CO_CSS = `
.ew-co h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.ew-co-list { display: flex; flex-direction: column; gap: 14px; }
.ew-co-card { background: #fff; border: 1px solid #e7e1d6; border-radius: 14px; padding: 18px 20px; }
.ew-co-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.ew-co-card-id { display: flex; align-items: center; gap: 9px; }
.ew-co-num { font-weight: 700; color: #123c2e; font-size: 14px; }
.ew-co-creep { font-size: 10px; font-weight: 600; color: #9b2c2c; background: rgba(155,44,44,.1); border: 1px solid rgba(155,44,44,.35); border-radius: 999px; padding: 1px 8px; text-transform: uppercase; letter-spacing: .4px; }
.ew-co-cardtitle { font-size: 18px; color: #123c2e; margin: 2px 0; }
.ew-co-desc { font-size: 13px; color: #2c2a26; margin: 4px 0; line-height: 1.5; }
.ew-co-reason { font-size: 12px; color: #7d776c; margin: 2px 0 8px; }
.ew-co-amounts { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12.5px; color: #7d776c; padding-top: 8px; border-top: 1px solid #e7e1d6; }
.ew-co-total { color: #123c2e; font-weight: 700; }
.ew-co-pill { font-size: 10.5px; font-weight: 600; padding: 2px 10px; border-radius: 999px; border: 1px solid #e7e1d6; background: #F7F4EE; color: #7d776c; }
.ew-co-pill.st-accepted, .ew-co-pill.st-paid { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.ew-co-pill.st-declined { background: rgba(155,44,44,.1); color: #9b2c2c; border-color: rgba(155,44,44,.35); }
.ew-co-pill.st-sent, .ew-co-pill.st-revision_requested, .ew-co-pill.st-added_to_invoice { background: rgba(201,163,91,.16); color: #8a5a12; border-color: rgba(201,163,91,.45); }
`;
