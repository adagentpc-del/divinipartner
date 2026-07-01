import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../../lib/api';

type Bid = {
  id: string;
  category: string | null;
  scope: string | null;
  budget_min: string | null;
  budget_max: string | null;
  deadline: string | null;
  tier_access: string | null;
  bid_type: string | null;
  rush: boolean;
  status: string | null;
  created_at: string;
};
type StatusMeta = { key: string; label: string };

const TIER_OPTIONS = ['premier', 'partner', 'free', 'private'];

export default function BidsTab({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<Bid[]>([]);
  const [statuses, setStatuses] = useState<StatusMeta[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ category: '', scope: '', budget_min: '', budget_max: '', tier_access: 'premier', rush: false });

  async function load() {
    try {
      const [b, meta] = await Promise.all([
        apiGet<{ bids: Bid[] }>(`/bids/event/${eventId}`),
        apiGet<{ statuses: StatusMeta[] }>(`/bids/meta`),
      ]);
      setRows(b.bids);
      setStatuses(meta.statuses);
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [eventId]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', '/bids', {
        event_id: eventId,
        category: form.category || null,
        scope: form.scope || null,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        tier_access: form.tier_access,
        rush: form.rush,
        post: true,
      });
      setForm({ category: '', scope: '', budget_min: '', budget_max: '', tier_access: 'premier', rush: false });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setBusy(true);
    try {
      await apiSend('POST', `/bids/${id}/status`, { status });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <style>{B_CSS}</style>
      {err ? <p className="ew-error">{err}</p> : null}

      <form className="ew-bid-form" onSubmit={post}>
        <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <input placeholder="Budget min" value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} />
        <input placeholder="Budget max" value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} />
        <select value={form.tier_access} onChange={(e) => setForm({ ...form, tier_access: e.target.value })}>
          {TIER_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="ew-bid-rush"><input type="checkbox" checked={form.rush} onChange={(e) => setForm({ ...form, rush: e.target.checked })} /> Rush</label>
        <input className="ew-bid-scope" placeholder="Scope" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} />
        <button type="submit" className="ew-btn" disabled={busy}>Post bid</button>
      </form>

      {rows.length === 0 ? (
        <div className="ew-empty"><p>No bids posted for this event yet. Post a bid to invite vendors to quote.</p></div>
      ) : (
        <div className="ew-bid-list">
          {rows.map((b) => (
            <div key={b.id} className="ew-bid-card">
              <div className="ew-bid-top">
                <span className="ew-bid-cat">{b.category ?? 'General'}</span>
                <span className={`ew-tag tier-${b.tier_access ?? 'public'}`}>{b.tier_access ?? 'public'}</span>
                {b.rush ? <span className="ew-tag rush">Rush</span> : null}
              </div>
              <p className="ew-bid-scopep">{b.scope ?? 'No scope provided.'}</p>
              <div className="ew-bid-meta">
                <span>Budget: {b.budget_min ?? '-'} to {b.budget_max ?? '-'}</span>
                <select value={b.status ?? ''} disabled={busy} onChange={(e) => setStatus(b.id, e.target.value)}>
                  {statuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const B_CSS = `
.ew-bid-form { display: flex; flex-wrap: wrap; gap: 9px; margin-bottom: 18px; align-items: center; }
.ew-bid-form input, .ew-bid-form select { font: inherit; padding: 9px 11px; border: 1px solid #e7e1d6; border-radius: 8px; background: #fff; }
.ew-bid-form input { width: 130px; }
.ew-bid-scope { flex: 1 1 220px; min-width: 180px; width: auto !important; }
.ew-bid-rush { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: #4a463e; }
.ew-bid-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.ew-bid-card { background: #fff; border: 1px solid #e7e1d6; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.ew-bid-top { display: flex; align-items: center; gap: 8px; }
.ew-bid-cat { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 19px; color: #123c2e; }
.ew-bid-scopep { margin: 0; font-size: 13px; color: #4a463e; line-height: 1.5; }
.ew-bid-meta { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12px; color: #7d776c; }
.ew-bid-meta select { font: inherit; padding: 6px 9px; border: 1px solid #e7e1d6; border-radius: 7px; background: #fff; }
.ew-tag { font-size: 10px; letter-spacing: .5px; text-transform: uppercase; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.ew-tag.tier-premier { background: rgba(201,163,91,.2); color: #8a6d27; border: 1px solid rgba(201,163,91,.5); }
.ew-tag.tier-partner { background: rgba(30,93,74,.12); color: #1E5D4A; border: 1px solid rgba(30,93,74,.3); }
.ew-tag.tier-free { background: #eef0ee; color: #5a6b62; border: 1px solid #dde2dd; }
.ew-tag.tier-private { background: #f3e9e9; color: #8a4a4a; border: 1px solid #e2caca; }
.ew-tag.rush { background: #fbeede; color: #a8631a; border: 1px solid #f0d2ac; }
@media (max-width: 720px) { .ew-bid-list { grid-template-columns: 1fr; } }
`;
