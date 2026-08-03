/**
 * Divini Change Desk (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
 * slice 8; originally built pre-spec as "Change Orders," blueprint section
 * 23). Route: /change-orders.
 *
 * Create and track change orders for an event: scope add-ons with a price
 * delta, an optional requested schedule change, a lifecycle status, and a
 * scope-creep flag. Every status transition is preserved in an append-only
 * history, viewable per change order. Reads the event from ?event_id; in
 * the Event Workspace this embeds as the Change Orders tab. Self-contained
 * styles. Zero em dashes.
 */
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';

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
  created_at: string;
};

type StatusHistoryRow = { id: string; from_status: string | null; to_status: string; changed_at: string };

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

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [requestedNewDate, setRequestedNewDate] = useState('');
  const [scheduleNote, setScheduleNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [history, setHistory] = useState<StatusHistoryRow[]>([]);

  const load = useCallback(() => {
    if (!eventId) { setLoading(false); return; }
    setLoading(true);
    apiGet<{ change_orders: ChangeOrder[] }>(`/change-orders?event_id=${encodeURIComponent(eventId)}`)
      .then((r) => setRows(r.change_orders ?? []))
      .catch((e) => setError(e?.message ?? 'Failed to load change orders'))
      .finally(() => setLoading(false));
  }, [eventId]);

  useEffect(() => { load(); }, [load]);

  async function toggleHistory(id: string) {
    if (openHistory === id) { setOpenHistory(null); return; }
    setOpenHistory(id);
    try {
      const r = await apiGet<{ history: StatusHistoryRow[] }>(`/change-orders/${id}/history`);
      setHistory(r.history ?? []);
    } catch {
      setHistory([]);
    }
  }

  async function createChangeOrder() {
    if (!eventId) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const amt = Number(amount);
      await apiSend('POST', '/change-orders', {
        event_id: eventId,
        title: title.trim() || null,
        description: description.trim() || null,
        reason: reason.trim() || null,
        line_items: Number.isFinite(amt) && amt > 0
          ? [{ description: title.trim() || 'Scope change', amount: amt }]
          : [],
        requested_new_date: requestedNewDate || null,
        schedule_change_note: scheduleNote.trim() || null,
      });
      setTitle(''); setDescription(''); setReason(''); setAmount(''); setRequestedNewDate(''); setScheduleNote('');
      setShowForm(false);
      load();
    } catch (e) {
      setSaveErr((e as Error)?.message ?? 'Could not create the change order.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dpco">
      <style>{CSS}</style>

      <header className="dpco-head">
        <div>
          <span className="dpco-kicker">Event workspace</span>
          <h1 className="dpco-title">Divini Change Desk</h1>
          <p className="dpco-sub">Track scope, price, and schedule changes for this event, with every approval preserved.</p>
        </div>
        {eventId ? (
          <button type="button" className="dpco-btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Cancel' : 'New change order'}
          </button>
        ) : null}
      </header>

      {showForm && eventId ? (
        <div className="dpco-form">
          <div className="dpco-form-row">
            <label>Title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Add uplighting package" />
            </label>
            <label>Amount ($)
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            </label>
          </div>
          <label>Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </label>
          <label>Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is scope changing?" />
          </label>
          <div className="dpco-form-row">
            <label>Requested new date (optional)
              <input type="date" value={requestedNewDate} onChange={(e) => setRequestedNewDate(e.target.value)} />
            </label>
            <label>Schedule change note (optional)
              <input value={scheduleNote} onChange={(e) => setScheduleNote(e.target.value)} placeholder="e.g. Move load-in to 8am" />
            </label>
          </div>
          {saveErr ? <div className="dpco-err" style={{ marginTop: 8 }}>{saveErr}</div> : null}
          <div className="dpco-form-actions">
            <button type="button" className="dpco-btn primary" disabled={saving} onClick={createChangeOrder}>
              {saving ? 'Creating...' : 'Create change order'}
            </button>
          </div>
        </div>
      ) : null}

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
              {(co.requested_new_date || co.schedule_change_note) ? (
                <p className="dpco-schedule">
                  Schedule change{co.requested_new_date ? `: requested date ${new Date(co.requested_new_date).toLocaleDateString()}` : ''}
                  {co.schedule_change_note ? ` — ${co.schedule_change_note}` : ''}
                </p>
              ) : null}
              <div className="dpco-amounts">
                <span>Subtotal {money(co.subtotal)}</span>
                <span>Platform fee {money(co.platform_fee)}</span>
                <span className="dpco-total">Total {money(co.amount)}</span>
              </div>
              <div className="dpco-signrow">
                <button type="button" className="dpco-histbtn" onClick={() => toggleHistory(co.id)}>
                  {openHistory === co.id ? 'Hide history' : 'Status history'}
                </button>
                <Link
                  className="dpco-sign"
                  to={`/sign/change_order_approval?related_object_type=change_order&related_object_id=${encodeURIComponent(co.id)}&title=${encodeURIComponent(`Change Order ${co.change_order_number ?? co.id.slice(0, 8)}`)}`}
                >
                  Sign approval
                </Link>
              </div>
              {openHistory === co.id ? (
                <div className="dpco-history">
                  {history.length === 0 ? (
                    <div className="dpco-history-row">No history yet.</div>
                  ) : (
                    history.map((h) => (
                      <div className="dpco-history-row" key={h.id}>
                        <span>{h.from_status ? `${STATUS_LABELS[h.from_status] ?? h.from_status} -> ` : ''}{STATUS_LABELS[h.to_status] ?? h.to_status}</span>
                        <span className="dpco-history-date">{new Date(h.changed_at).toLocaleString()}</span>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
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

.dpco-form { background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 18px 20px; margin-bottom: 18px; display: flex; flex-direction: column; gap: 12px; }
.dpco-form label { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: var(--dp-muted); flex: 1; }
.dpco-form input, .dpco-form textarea { font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid var(--dp-line); border-radius: 8px; color: var(--dp-ink); background: var(--dp-ivory); }
.dpco-form-row { display: flex; gap: 14px; flex-wrap: wrap; }
.dpco-form-row label { min-width: 200px; }
.dpco-form-actions { display: flex; justify-content: flex-end; }

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
.dpco-signrow { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; gap: 10px; }
.dpco-sign { font-size: 12.5px; font-weight: 600; text-decoration: none; padding: 7px 14px; border-radius: 9px; background: var(--dp-emerald); color: #fff; }
.dpco-sign:hover { background: var(--dp-emerald-2); }
.dpco-schedule { font-size: 12px; color: var(--dp-emerald-2); background: rgba(30,93,74,.08); border-radius: 8px; padding: 6px 10px; margin: 6px 0; }
.dpco-histbtn { font: inherit; font-size: 12px; font-weight: 600; color: var(--dp-emerald-2); background: none; border: none; cursor: pointer; text-decoration: underline; padding: 0; }
.dpco-history { margin-top: 10px; border-top: 1px dashed var(--dp-line); padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.dpco-history-row { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--dp-muted); gap: 10px; }
.dpco-history-date { white-space: nowrap; }
`;
