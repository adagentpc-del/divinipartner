/**
 * Change Orders (blueprint section 23). Route: /change-orders.
 *
 * Create and track change orders for an event: scope add-ons with a price delta,
 * a lifecycle status, and a scope-creep flag. Reads the event from ?event_id; in
 * the Event Workspace this embeds as the Change Orders tab. Self-contained styles.
 * Zero em dashes.
 */
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiGet } from '../../lib/api';

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

export default function ChangeOrders() {
  const [params] = useSearchParams();
  const eventId = params.get('event_id');
  const [rows, setRows] = useState<ChangeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!eventId) { setLoading(false); return; }
    setLoading(true);
    apiGet<{ change_orders: ChangeOrder[] }>(`/change-orders?event_id=${encodeURIComponent(eventId)}`)
      .then((r) => setRows(r.change_orders ?? []))
      .catch((e) => setError(e?.message ?? 'Failed to load change orders'))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="dpco">
      <style>{CSS}</style>

      <header className="dpco-head">
        <div>
          <span className="dpco-kicker">Event workspace</span>
          <h1 className="dpco-title">Change orders</h1>
          <p className="dpco-sub">Track scope changes and price deltas for this event.</p>
        </div>
        {eventId ? <button type="button" className="dpco-btn primary">New change order</button> : null}
      </header>

      {!eventId ? (
        <div className="dpco-empty">Select an event to view its change orders. Pass <code>?event_id=</code> in the URL or open this from the Event Workspace.</div>
      ) : loading ? (
        <div className="dpco-empty">Loading change orders...</div>
      ) : error ? (
        <div className="dpco-empty dpco-err">{error}</div>
      ) : rows.length === 0 ? (
        <div className="dpco-empty"><p>No change orders for this event. Create one when scope is added or revised after the original quote.</p></div>
      ) : (
        <div className="dpco-list">
          {rows.map((co) => (
            <div key={co.id} className="dpco-card">
              <div className="dpco-card-top">
                <div className="dpco-card-id">
                  <span className="dpco-num">{co.change_order_number ?? co.id.slice(0, 8)}</span>
                  {co.scope_creep_flag ? <span className="dpco-creep">Scope creep</span> : null}
                </div>
                <span className={`dpco-pill st-${co.status ?? 'draft'}`}>{STATUS_LABELS[co.status ?? 'draft'] ?? co.status}</span>
              </div>
              {co.title ? <h3 className="dpco-cardtitle">{co.title}</h3> : null}
              {co.description ? <p className="dpco-desc">{co.description}</p> : null}
              {co.reason ? <p className="dpco-reason">Reason: {co.reason}</p> : null}
              <div className="dpco-amounts">
                <span>Subtotal {money(co.subtotal)}</span>
                <span>Platform fee {money(co.platform_fee)}</span>
                <span className="dpco-total">Total {money(co.amount)}</span>
              </div>
              <div className="dpco-signrow">
                <Link
                  className="dpco-sign"
                  to={`/sign/change_order_approval?related_object_type=change_order&related_object_id=${encodeURIComponent(co.id)}&title=${encodeURIComponent(`Change Order ${co.change_order_number ?? co.id.slice(0, 8)}`)}`}
                >
                  Sign approval
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CSS = `
.dpco {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
}
.dpco h1, .dpco h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.dpco-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.dpco-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.dpco-title { font-size: 30px; color: var(--dp-emerald); line-height: 1.1; margin-top: 2px; }
.dpco-sub { font-size: 13px; color: var(--dp-muted); margin: 4px 0 0; }

.dpco-btn { font: inherit; font-size: 13px; font-weight: 600; padding: 9px 16px; border-radius: 10px; cursor: pointer; border: 1px solid transparent; }
.dpco-btn.primary { background: var(--dp-emerald); color: #fff; }
.dpco-btn.primary:hover { background: var(--dp-emerald-2); }

.dpco-empty { background: #fff; border: 1px dashed var(--dp-line); border-radius: 14px; padding: 26px; color: var(--dp-muted); font-size: 13.5px; line-height: 1.55; }
.dpco-empty code { background: var(--dp-ivory); border: 1px solid var(--dp-line); border-radius: 5px; padding: 1px 6px; font-size: 12px; }
.dpco-err { color: #9b2c2c; border-color: rgba(155,44,44,.4); }

.dpco-list { display: flex; flex-direction: column; gap: 14px; }
.dpco-card { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 18px 20px; }
.dpco-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.dpco-card-id { display: flex; align-items: center; gap: 9px; }
.dpco-num { font-weight: 700; color: var(--dp-emerald); font-size: 14px; }
.dpco-creep { font-size: 10px; font-weight: 600; color: #9b2c2c; background: rgba(155,44,44,.1); border: 1px solid rgba(155,44,44,.35); border-radius: 999px; padding: 1px 8px; text-transform: uppercase; letter-spacing: .4px; }
.dpco-cardtitle { font-size: 18px; color: var(--dp-emerald); margin: 2px 0; }
.dpco-desc { font-size: 13px; color: var(--dp-ink); margin: 4px 0; line-height: 1.5; }
.dpco-reason { font-size: 12px; color: var(--dp-muted); margin: 2px 0 8px; }
.dpco-amounts { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12.5px; color: var(--dp-muted); padding-top: 8px; border-top: 1px solid var(--dp-line); }
.dpco-total { color: var(--dp-emerald); font-weight: 700; }
.dpco-pill { font-size: 10.5px; font-weight: 600; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--dp-line); background: var(--dp-ivory); color: var(--dp-muted); }
.dpco-pill.st-accepted, .dpco-pill.st-paid { background: rgba(30,93,74,.12); color: var(--dp-emerald-2); border-color: rgba(30,93,74,.3); }
.dpco-pill.st-declined { background: rgba(155,44,44,.1); color: #9b2c2c; border-color: rgba(155,44,44,.35); }
.dpco-pill.st-sent, .dpco-pill.st-revision_requested, .dpco-pill.st-added_to_invoice { background: rgba(201,163,91,.16); color: #8a5a12; border-color: rgba(201,163,91,.45); }
.dpco-signrow { display: flex; justify-content: flex-end; margin-top: 12px; }
.dpco-sign { font-size: 12.5px; font-weight: 600; text-decoration: none; padding: 7px 14px; border-radius: 9px; background: var(--dp-emerald); color: #fff; }
.dpco-sign:hover { background: var(--dp-emerald-2); }
`;
