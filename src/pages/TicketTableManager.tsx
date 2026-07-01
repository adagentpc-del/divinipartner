/**
 * Nonprofit / Charity core - Ticket / Table Manager (Workstream B).
 *
 * Build ticket and table packages (individual seat, VIP seat, full table,
 * sponsor table) for a selected fundraising event: type, price, seats per
 * package, quantity available, and sold. Data flows through
 * /api/fundraising-events (to pick an event) and /api/ticket-packages
 * (org-scoped + IDOR-safe). Shared .card/.btn/.note theme classes.
 */
import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

type FundraisingEvent = { id: string; name: string };

type TicketPackage = {
  id: string;
  name: string | null;
  type: string | null;
  price: string | null;
  seats: number | null;
  quantity: number | null;
  sold: number | null;
  status: string | null;
};

const TYPES = ['individual', 'vip', 'table', 'sponsor_table'];

type EditState = {
  id: string | null;
  name: string;
  type: string;
  price: string;
  seats: string;
  quantity: string;
  sold: string;
  status: string;
};

function blank(): EditState {
  return {
    id: null,
    name: '',
    type: 'individual',
    price: '',
    seats: '1',
    quantity: '',
    sold: '0',
    status: 'open',
  };
}

function money(v: string | null): string {
  const n = v == null ? 0 : Number(v);
  if (!Number.isFinite(n) || n === 0) return '-';
  return `$${n.toLocaleString()}`;
}

export default function TicketTableManager() {
  const [events, setEvents] = useState<FundraisingEvent[]>([]);
  const [eventId, setEventId] = useState<string>('');
  const [packages, setPackages] = useState<TicketPackage[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadEvents() {
    setLoadingEvents(true);
    try {
      const r = await apiGet<{ events: FundraisingEvent[] }>('/fundraising-events');
      setEvents(r.events ?? []);
      if ((r.events ?? []).length && !eventId) setEventId(r.events[0].id);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoadingEvents(false);
    }
  }

  async function loadPackages(id: string) {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ packages: TicketPackage[] }>(`/ticket-packages/event/${id}`);
      setPackages(r.packages ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (eventId) void loadPackages(eventId);
    else setPackages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  function startCreate() {
    setEditing(blank());
  }

  function startEdit(p: TicketPackage) {
    setEditing({
      id: p.id,
      name: p.name ?? '',
      type: p.type ?? 'individual',
      price: p.price != null ? String(Number(p.price)) : '',
      seats: p.seats != null ? String(p.seats) : '1',
      quantity: p.quantity != null ? String(p.quantity) : '',
      sold: p.sold != null ? String(p.sold) : '0',
      status: p.status ?? 'open',
    });
  }

  async function save() {
    if (!editing || !eventId) return;
    setBusy(true);
    setErr(null);
    try {
      const body = {
        name: editing.name.trim() || null,
        type: editing.type,
        price: editing.price ? Number(editing.price) : 0,
        seats: editing.seats ? Number(editing.seats) : 1,
        quantity: editing.quantity ? Number(editing.quantity) : 0,
        sold: editing.sold ? Number(editing.sold) : 0,
        status: editing.status || 'open',
      };
      if (editing.id) {
        await apiSend('PATCH', `/ticket-packages/${editing.id}`, body);
      } else {
        await apiSend('POST', `/ticket-packages/event/${eventId}`, body);
      }
      setEditing(null);
      await loadPackages(eventId);
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
      await apiSend('DELETE', `/ticket-packages/${id}`);
      await loadPackages(eventId);
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
          <h1>Ticket and Table Manager</h1>
          <div className="sub">Individual, VIP, table, and sponsor-table packages</div>
        </div>
        {eventId && <button className="btn primary" onClick={startCreate}>+ Add ticket package</button>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <label style={{ display: 'block' }}>
          <div className="note" style={{ marginBottom: 6 }}>Fundraising event</div>
          {loadingEvents ? (
            <p className="note" style={{ margin: 0 }}>Loading your fundraising events...</p>
          ) : events.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>
              No fundraising events yet. Create one in the Fundraising Event Builder first.
            </p>
          ) : (
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} style={{ width: '100%' }}>
              {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.name}</option>)}
            </select>
          )}
        </label>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>
          {err}
        </div>
      )}

      {!eventId ? null : loading ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading ticket packages...</p></div>
      ) : packages.length === 0 ? (
        <div className="card">
          <p className="note" style={{ margin: 0, lineHeight: 1.7 }}>
            No ticket or table packages yet. Add individual seats, VIP seats, full
            tables, or sponsor tables with their pricing and seat counts.
          </p>
        </div>
      ) : (
        <div className="grid cards2">
          {packages.map((p) => (
            <div className="card" key={p.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <h3 style={{ margin: 0 }}>{p.name || (p.type ?? 'Package')}</h3>
                <span className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>
                  {(p.type ?? '').replace(/_/g, ' ')}
                </span>
              </div>
              <div style={{ margin: '8px 0', fontWeight: 600 }}>{money(p.price)}</div>
              <div className="note" style={{ lineHeight: 1.8 }}>
                <div>Seats per package: {p.seats ?? 1}</div>
                <div>Sold: {p.sold ?? 0} of {p.quantity ?? 0}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={() => startEdit(p)}>Edit</button>
                <button className="btn" onClick={() => remove(p.id)} disabled={busy}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="sectitle">{editing.id ? 'Edit ticket package' : 'New ticket package'}</div>
          <div className="grid cards2" style={{ gap: 12 }}>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Package name</div>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ width: '100%' }} placeholder="VIP Table of 10" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Type</div>
              <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })} style={{ width: '100%' }}>
                {TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Price</div>
              <input value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} style={{ width: '100%' }} placeholder="5000" inputMode="decimal" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Seats per package</div>
              <input value={editing.seats} onChange={(e) => setEditing({ ...editing, seats: e.target.value })} style={{ width: '100%' }} placeholder="10" inputMode="numeric" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Quantity available</div>
              <input value={editing.quantity} onChange={(e) => setEditing({ ...editing, quantity: e.target.value })} style={{ width: '100%' }} placeholder="20" inputMode="numeric" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Sold</div>
              <input value={editing.sold} onChange={(e) => setEditing({ ...editing, sold: e.target.value })} style={{ width: '100%' }} placeholder="0" inputMode="numeric" />
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
