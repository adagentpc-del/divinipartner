import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../../lib/api';

/**
 * Events list - the entry point into per-event workspaces. Lists events the
 * signed-in actor can access (with lifecycle status) and creates new ones.
 */
type EventRow = {
  id: string;
  name: string;
  type: string | null;
  date_time: string | null;
  guest_count: number | null;
  budget: string | null;
  status: string | null;
};
type StatusMeta = { key: string; label: string };

function statusLabel(statuses: StatusMeta[], key: string | null): string {
  return statuses.find((s) => s.key === key)?.label ?? key ?? 'Inquiry';
}

export default function EventsList() {
  const nav = useNavigate();
  const [rows, setRows] = useState<EventRow[]>([]);
  const [statuses, setStatuses] = useState<StatusMeta[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', type: '', date_time: '', guest_count: '', budget: '' });
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [e, meta] = await Promise.all([
        apiGet<{ events: EventRow[] }>(`/events`),
        apiGet<{ statuses: StatusMeta[] }>(`/events/meta`),
      ]);
      setRows(e.events);
      setStatuses(meta.statuses);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ event: EventRow }>('POST', '/events', {
        name: form.name.trim(),
        type: form.type.trim() || null,
        date_time: form.date_time || null,
        guest_count: form.guest_count ? Number(form.guest_count) : null,
        budget: form.budget ? Number(form.budget) : null,
      });
      nav(`/events/${r.event.id}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="evl">
      <style>{EVL_CSS}</style>

      <header className="evl-head">
        <div>
          <span className="evl-kicker">Divini Partners</span>
          <h1 className="evl-title">Events</h1>
        </div>
        <button type="button" className="evl-btn" onClick={() => setCreating((v) => !v)}>
          {creating ? 'Cancel' : 'New event'}
        </button>
      </header>

      {err ? <p className="evl-error">{err}</p> : null}

      {creating ? (
        <form className="evl-form" onSubmit={create}>
          <input placeholder="Event name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Type (e.g. Wedding)" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
          <input type="datetime-local" value={form.date_time} onChange={(e) => setForm({ ...form, date_time: e.target.value })} />
          <input placeholder="Guests" value={form.guest_count} onChange={(e) => setForm({ ...form, guest_count: e.target.value })} />
          <input placeholder="Budget" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
          <button type="submit" className="evl-btn" disabled={busy}>Create and open</button>
        </form>
      ) : null}

      {loading ? (
        <p className="evl-muted">Loading events...</p>
      ) : rows.length === 0 ? (
        <div className="evl-empty">
          <span className="evl-empty-glyph" aria-hidden="true">E</span>
          <p>No events yet. Create your first event to open its workspace.</p>
        </div>
      ) : (
        <div className="evl-grid">
          {rows.map((ev) => (
            <button key={ev.id} type="button" className="evl-card" onClick={() => nav(`/events/${ev.id}`)}>
              <div className="evl-card-top">
                <span className="evl-card-name">{ev.name}</span>
                <span className="evl-card-status">{statusLabel(statuses, ev.status)}</span>
              </div>
              <div className="evl-card-meta">
                <span>{ev.type ?? 'Event'}</span>
                {ev.date_time ? <span>{new Date(ev.date_time).toLocaleDateString()}</span> : null}
                {ev.guest_count != null ? <span>{ev.guest_count} guests</span> : null}
                {ev.budget ? <span>${Number(ev.budget).toLocaleString()}</span> : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const EVL_CSS = `
.evl {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif; color: var(--dp-ink);
  background: var(--dp-ivory); min-height: 100vh; padding: 28px 30px 60px; max-width: 1100px; margin: 0 auto;
}
.evl *, .evl *::before, .evl *::after { box-sizing: border-box; }
.evl h1 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }
.evl-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
.evl-kicker { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 600; }
.evl-title { font-size: 32px; color: var(--dp-emerald); line-height: 1.05; }
.evl-btn { background: var(--dp-emerald); color: #fff; border: 0; border-radius: 9px; font: inherit; font-size: 12.5px; font-weight: 600; padding: 9px 17px; cursor: pointer; }
.evl-btn:hover { background: var(--dp-emerald-2); }
.evl-btn:disabled { opacity: .55; }
.evl-error { color: #8a3a3a; background: #f6eaea; border: 1px solid #e2caca; border-radius: 8px; padding: 9px 12px; font-size: 12.5px; }
.evl-muted { color: var(--dp-muted); font-size: 13px; }
.evl-form { display: flex; flex-wrap: wrap; gap: 9px; background: #fff; border: 1px solid var(--dp-line); border-radius: 12px; padding: 16px; margin-bottom: 22px; }
.evl-form input { font: inherit; padding: 9px 12px; border: 1px solid var(--dp-line); border-radius: 8px; background: #fff; flex: 1 1 160px; min-width: 130px; }
.evl-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
.evl-card { text-align: left; background: #fff; border: 1px solid var(--dp-line); border-radius: 14px; padding: 18px; cursor: pointer; display: flex; flex-direction: column; gap: 10px; transition: border-color .15s ease, box-shadow .15s ease; font: inherit; }
.evl-card:hover { border-color: var(--dp-gold); box-shadow: 0 4px 16px rgba(18,60,46,.07); }
.evl-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.evl-card-name { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 21px; color: var(--dp-emerald); }
.evl-card-status { font-size: 10.5px; letter-spacing: .4px; text-transform: uppercase; font-weight: 600; color: var(--dp-emerald); background: rgba(201,163,91,.2); border: 1px solid rgba(201,163,91,.5); padding: 3px 9px; border-radius: 999px; white-space: nowrap; }
.evl-card-meta { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--dp-muted); }
.evl-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 56px 20px; color: var(--dp-muted); }
.evl-empty-glyph { width: 46px; height: 46px; border-radius: 12px; background: rgba(201,163,91,.18); color: var(--dp-emerald); display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 700; font-size: 22px; }
.evl-empty p { margin: 0; font-size: 13.5px; max-width: 320px; line-height: 1.6; }
@media (max-width: 720px) { .evl-grid { grid-template-columns: 1fr; } }
`;
