import React, { useEffect, useState, useCallback } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

/**
 * Change Orders tab, extended for the live-ops phase (Part 13-14) into the
 * "Live Change Requests" flow: any event participant can submit a change
 * request (cost + timing impact + reason, the same fields this table
 * already had); an owner/planner can Approve, Decline, or Discuss
 * (revision_requested) it. This is NOT a second, disconnected "day-of
 * expense" system -- it is the same change_orders table Divini Change Desk
 * already used, extended with the review actions the live-ops spec calls
 * for. Approving records event change history + activity timeline entries
 * and marks the Final Event Schedule stale if it touched schedule/vendor
 * scope (server-side, db/eventChanges.ts + db/eventActivity.ts +
 * db/packetInvalidation.ts).
 *
 * The standalone ChangeOrders page reads its event from the ?event_id
 * query param, which the workspace route (/events/:id) does not carry.
 * This wrapper reuses the same data shape and card markup but takes the
 * event id from the workspace prop and filters via GET
 * /change-orders?event_id=. Graceful empty state per event.
 *
 * Zero em dashes.
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
  requested_new_date: string | null;
  schedule_change_note: string | null;
  requested_by: string | null;
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
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', reason: '', amount: '', requested_new_date: '', schedule_change_note: '' });
  const [submitBusy, setSubmitBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ change_orders: ChangeOrder[] }>(`/change-orders?event_id=${encodeURIComponent(eventId)}`)
      .then((r) => setRows(r.change_orders ?? []))
      .catch((e) => setError(e?.message ?? 'Failed to load change orders'))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function submitRequest() {
    if (!form.title.trim()) { setActionErr('A title is required.'); return; }
    setSubmitBusy(true);
    setActionErr(null);
    try {
      const amount = Number(form.amount || 0);
      await apiSend('POST', '/change-orders', {
        event_id: eventId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        reason: form.reason.trim() || null,
        line_items: amount ? [{ description: form.title.trim(), amount }] : [],
        requested_new_date: form.requested_new_date || null,
        schedule_change_note: form.schedule_change_note.trim() || null,
        status: 'sent',
      });
      setForm({ title: '', description: '', reason: '', amount: '', requested_new_date: '', schedule_change_note: '' });
      setShowForm(false);
      load();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setSubmitBusy(false);
    }
  }

  async function respond(co: ChangeOrder, status: 'accepted' | 'declined' | 'revision_requested') {
    setActionBusy(co.id + status);
    setActionErr(null);
    try {
      await apiSend('PATCH', `/change-orders/${co.id}/status`, { status });
      load();
    } catch (e) {
      setActionErr((e as Error).message);
    } finally {
      setActionBusy(null);
    }
  }

  if (loading) return <p className="ew-muted">Loading change orders...</p>;
  if (error) return <p className="ew-error">{error}</p>;

  return (
    <div className="ew-co">
      <style>{CO_CSS}</style>
      {actionErr ? <p className="ew-error">{actionErr}</p> : null}

      <div className="ew-co-toolbar">
        <button type="button" className="ew-btn sm" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : 'Submit change request'}
        </button>
      </div>

      {showForm ? (
        <div className="ew-co-form">
          <input
            className="ew-co-input"
            placeholder="Title (e.g. Add two more round tables)"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <textarea
            className="ew-co-input"
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
          <textarea
            className="ew-co-input"
            placeholder="Reason"
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />
          <div className="ew-co-formrow">
            <input
              className="ew-co-input"
              type="number"
              placeholder="Cost impact ($)"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
            <input
              className="ew-co-input"
              type="datetime-local"
              placeholder="Requested new date/time"
              value={form.requested_new_date}
              onChange={(e) => setForm((f) => ({ ...f, requested_new_date: e.target.value }))}
            />
          </div>
          <input
            className="ew-co-input"
            placeholder="Schedule change note (e.g. push dinner service 15 minutes)"
            value={form.schedule_change_note}
            onChange={(e) => setForm((f) => ({ ...f, schedule_change_note: e.target.value }))}
          />
          <button type="button" className="ew-btn sm" onClick={() => void submitRequest()} disabled={submitBusy}>
            {submitBusy ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="ew-empty">
          <p>No change orders for this event. Create one when scope is added or revised after the original quote.</p>
        </div>
      ) : (
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
              {co.schedule_change_note ? <p className="ew-co-reason">Schedule impact: {co.schedule_change_note}</p> : null}
              <div className="ew-co-amounts">
                <span>Subtotal {money(co.subtotal)}</span>
                <span>Platform fee {money(co.platform_fee)}</span>
                <span className="ew-co-total">Total {money(co.amount)}</span>
              </div>
              {co.status === 'sent' || co.status === 'revision_requested' ? (
                <div className="ew-co-acts">
                  <button
                    type="button"
                    className="ew-btn sm"
                    onClick={() => void respond(co, 'accepted')}
                    disabled={!!actionBusy}
                  >
                    {actionBusy === co.id + 'accepted' ? 'Approving...' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    className="ew-btn ghost sm"
                    onClick={() => void respond(co, 'declined')}
                    disabled={!!actionBusy}
                  >
                    {actionBusy === co.id + 'declined' ? 'Declining...' : 'Decline'}
                  </button>
                  <button
                    type="button"
                    className="ew-btn ghost sm"
                    onClick={() => void respond(co, 'revision_requested')}
                    disabled={!!actionBusy}
                  >
                    {actionBusy === co.id + 'revision_requested' ? 'Sending...' : 'Discuss'}
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const CO_CSS = `
.ew-co h3 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.ew-co-toolbar { margin-bottom: 14px; }
.ew-co-form { display: flex; flex-direction: column; gap: 8px; background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 14px 16px; margin-bottom: 14px; }
.ew-co-formrow { display: flex; gap: 8px; }
.ew-co-input { font: inherit; font-size: 13.5px; padding: 8px 10px; border: 1px solid #e7e1d6; border-radius: 8px; flex: 1; }
.ew-co-list { display: flex; flex-direction: column; gap: 14px; }
.ew-co-card { background: #fff; border: 1px solid #e7e1d6; border-radius: 14px; padding: 18px 20px; }
.ew-co-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.ew-co-card-id { display: flex; align-items: center; gap: 9px; }
.ew-co-num { font-weight: 700; color: #123c2e; font-size: 14px; }
.ew-co-creep { font-size: 10px; font-weight: 600; color: #9b2c2c; background: rgba(155,44,44,.1); border: 1px solid rgba(155,44,44,.35); border-radius: 999px; padding: 1px 8px; text-transform: uppercase; letter-spacing: .4px; }
.ew-co-cardtitle { font-size: 18px; color: #123c2e; margin: 2px 0; }
.ew-co-desc { font-size: 13px; color: #2c2a26; margin: 4px 0; line-height: 1.5; }
.ew-co-reason { font-size: 12px; color: #6b6459; margin: 2px 0 8px; }
.ew-co-amounts { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12.5px; color: #6b6459; padding-top: 8px; border-top: 1px solid #e7e1d6; }
.ew-co-total { color: #123c2e; font-weight: 700; }
.ew-co-pill { font-size: 10.5px; font-weight: 600; padding: 2px 10px; border-radius: 999px; border: 1px solid #e7e1d6; background: #F7F4EE; color: #6b6459; }
.ew-co-pill.st-accepted, .ew-co-pill.st-paid { background: rgba(30,93,74,.12); color: #1E5D4A; border-color: rgba(30,93,74,.3); }
.ew-co-pill.st-declined { background: rgba(155,44,44,.1); color: #9b2c2c; border-color: rgba(155,44,44,.35); }
.ew-co-pill.st-sent, .ew-co-pill.st-revision_requested, .ew-co-pill.st-added_to_invoice { background: rgba(201,163,91,.16); color: #8a5a12; border-color: rgba(201,163,91,.45); }
.ew-co-acts { display: flex; gap: 8px; margin-top: 10px; }
`;
