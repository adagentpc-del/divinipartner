/**
 * Nonprofit / Charity core - Fundraising Event Builder (Workstream B).
 *
 * Create / edit a nonprofit's fundraising events (gala, luncheon, golf outing,
 * auction, ...) and list the org's existing events. Each event carries a cause,
 * kind, fundraising goal, budget, date, and guest target. Data flows through the
 * backend at /api/fundraising-events (org-scoped + IDOR-safe). Luxury
 * ivory/champagne theme via the shared .card/.btn/.note global classes used by
 * the other authed pages.
 */
import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

type FundraisingEvent = {
  id: string;
  name: string;
  cause: string | null;
  kind: string | null;
  goal_amount: string | null;
  budget: string | null;
  event_date: string | null;
  guest_target: number | null;
  status: string | null;
};

const KINDS = [
  'gala',
  'fundraiser',
  'luncheon',
  'golf',
  'auction',
  'conference',
  'community',
  'awareness',
  'donor_dinner',
];

type EditState = {
  id: string | null;
  name: string;
  cause: string;
  kind: string;
  goal_amount: string;
  budget: string;
  event_date: string;
  guest_target: string;
  status: string;
};

const BLANK: EditState = {
  id: null,
  name: '',
  cause: '',
  kind: 'gala',
  goal_amount: '',
  budget: '',
  event_date: '',
  guest_target: '',
  status: 'draft',
};

function money(v: string | null): string {
  const n = v == null ? 0 : Number(v);
  if (!Number.isFinite(n) || n === 0) return '-';
  return `$${n.toLocaleString()}`;
}

function toDateInput(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function FundraisingEventBuilder() {
  const [events, setEvents] = useState<FundraisingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ events: FundraisingEvent[] }>('/fundraising-events');
      setEvents(r.events ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function startCreate() {
    setEditing({ ...BLANK });
  }

  function startEdit(ev: FundraisingEvent) {
    setEditing({
      id: ev.id,
      name: ev.name ?? '',
      cause: ev.cause ?? '',
      kind: ev.kind ?? 'gala',
      goal_amount: ev.goal_amount != null ? String(Number(ev.goal_amount)) : '',
      budget: ev.budget != null ? String(Number(ev.budget)) : '',
      event_date: toDateInput(ev.event_date),
      guest_target: ev.guest_target != null ? String(ev.guest_target) : '',
      status: ev.status ?? 'draft',
    });
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      setErr('Event name is required.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const body = {
        name: editing.name.trim(),
        cause: editing.cause.trim() || null,
        kind: editing.kind,
        goal_amount: editing.goal_amount ? Number(editing.goal_amount) : 0,
        budget: editing.budget ? Number(editing.budget) : 0,
        event_date: editing.event_date ? new Date(editing.event_date).toISOString() : null,
        guest_target: editing.guest_target ? Number(editing.guest_target) : null,
        status: editing.status || 'draft',
      };
      if (editing.id) {
        await apiSend('PATCH', `/fundraising-events/${editing.id}`, body);
      } else {
        await apiSend('POST', '/fundraising-events', body);
      }
      setEditing(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setErr(null);
    try {
      await apiSend('DELETE', `/fundraising-events/${id}`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fundraising Event Builder</h1>
          <div className="sub">Plan galas, luncheons, golf outings, auctions, and more</div>
        </div>
        <button className="btn primary" onClick={startCreate}>+ New fundraising event</button>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>
          {err}
        </div>
      )}

      {loading ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading fundraising events...</p></div>
      ) : events.length === 0 ? (
        <div className="card">
          <p className="note" style={{ margin: 0, lineHeight: 1.7 }}>
            No fundraising events yet. Create your first gala, luncheon, or golf outing
            to start building sponsorship and ticket packages around it.
          </p>
        </div>
      ) : (
        <div className="grid cards2">
          {events.map((ev) => (
            <div className="card" key={ev.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <h3 style={{ margin: 0 }}>{ev.name}</h3>
                <span className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>
                  {(ev.kind ?? 'event').replace(/_/g, ' ')}
                </span>
              </div>
              {ev.cause && <div className="note" style={{ marginTop: 4 }}>{ev.cause}</div>}
              <div className="note" style={{ lineHeight: 1.8, marginTop: 8 }}>
                <div>Goal: {money(ev.goal_amount)}</div>
                <div>Budget: {money(ev.budget)}</div>
                <div>Date: {ev.event_date ? new Date(ev.event_date).toLocaleDateString() : '-'}</div>
                <div>Guest target: {ev.guest_target ?? '-'}</div>
                <div>Status: {ev.status ?? 'draft'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={() => startEdit(ev)}>Edit</button>
                <button className="btn" onClick={() => remove(ev.id)} disabled={busy}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="sectitle">{editing.id ? 'Edit fundraising event' : 'New fundraising event'}</div>
          <div className="grid cards2" style={{ gap: 12 }}>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Event name</div>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ width: '100%' }} placeholder="Annual Benefit Gala" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Cause</div>
              <input value={editing.cause} onChange={(e) => setEditing({ ...editing, cause: e.target.value })} style={{ width: '100%' }} placeholder="Childhood literacy" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Kind</div>
              <select value={editing.kind} onChange={(e) => setEditing({ ...editing, kind: e.target.value })} style={{ width: '100%' }}>
                {KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Status</div>
              <input value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} style={{ width: '100%' }} placeholder="draft" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Fundraising goal</div>
              <input value={editing.goal_amount} onChange={(e) => setEditing({ ...editing, goal_amount: e.target.value })} style={{ width: '100%' }} placeholder="250000" inputMode="decimal" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Budget</div>
              <input value={editing.budget} onChange={(e) => setEditing({ ...editing, budget: e.target.value })} style={{ width: '100%' }} placeholder="60000" inputMode="decimal" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Event date</div>
              <input type="date" value={editing.event_date} onChange={(e) => setEditing({ ...editing, event_date: e.target.value })} style={{ width: '100%' }} />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Guest target</div>
              <input value={editing.guest_target} onChange={(e) => setEditing({ ...editing, guest_target: e.target.value })} style={{ width: '100%' }} placeholder="300" inputMode="numeric" />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            <button className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
