import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

/**
 * Phase 5 - Venue Revenue Inventory manager (Venue Intelligence addendum data
 * model 10). A venue manages its monetizable inventory: screens, walls,
 * elevators, pool, rooftop, keycards, VIP, registration, parking, and any other
 * brandable or sellable surface, with pricing, availability windows,
 * audience/impression estimates, and structured restrictions.
 *
 * The page is venue-scoped: the venue id comes from ?venue=<id> (and is
 * remembered in localStorage so it survives a refresh). All reads and writes go
 * through the org-scoped, IDOR-safe /revenue-inventory API.
 */

type RevenueItem = {
  id: string;
  venue_id?: string | null;
  name: string;
  category?: string | null;
  pricing?: unknown;
  availability?: unknown;
  photos?: unknown;
  audience_size?: number | null;
  impression_estimate?: number | null;
  restrictions?: unknown;
  created_at?: string;
  updated_at?: string;
};

// Common monetizable inventory categories (addendum data model 10).
const CATEGORIES = [
  'screen', 'wall', 'elevator', 'pool', 'rooftop', 'keycard', 'vip',
  'registration', 'parking', 'banner', 'digital', 'experiential', 'other',
];

const PRICE_BASIS = ['per_event', 'per_day', 'per_week', 'per_month', 'flat'];

const VENUE_KEY = 'dp.vi.venueId';

type EditState = {
  id?: string;
  name: string;
  category: string;
  price: string;
  price_basis: string;
  audience_size: string;
  impression_estimate: string;
  availability_notes: string;
  restrictions_notes: string;
  photo_url: string;
};

const EMPTY: EditState = {
  name: '', category: 'screen', price: '', price_basis: 'per_event',
  audience_size: '', impression_estimate: '', availability_notes: '',
  restrictions_notes: '', photo_url: '',
};

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '-';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function pricingSummary(p: unknown): string {
  if (!p || typeof p !== 'object') return 'No pricing set';
  const rec = p as Record<string, unknown>;
  const amount = rec.amount ?? rec.price;
  if (amount == null) return 'No pricing set';
  const basis = typeof rec.basis === 'string' ? rec.basis.replace(/_/g, ' ') : '';
  return `${money(amount)}${basis ? ` ${basis}` : ''}`;
}

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function RevenueInventory() {
  const [params, setParams] = useSearchParams();
  const initialVenue = params.get('venue') || localStorage.getItem(VENUE_KEY) || '';
  const [venueId, setVenueId] = useState<string>(initialVenue);
  const [venueInput, setVenueInput] = useState<string>(initialVenue);

  const [items, setItems] = useState<RevenueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(id: string) {
    if (!id) { setItems([]); return; }
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ items: RevenueItem[] }>(`/revenue-inventory?venue=${encodeURIComponent(id)}`);
      setItems(r.items ?? []);
    } catch (e) {
      setErr((e as Error).message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(venueId); }, [venueId]);

  function applyVenue() {
    const id = venueInput.trim();
    setVenueId(id);
    if (id) {
      localStorage.setItem(VENUE_KEY, id);
      setParams({ venue: id });
    } else {
      localStorage.removeItem(VENUE_KEY);
      setParams({});
    }
  }

  function startCreate() { setEditing({ ...EMPTY }); }

  function startEdit(it: RevenueItem) {
    const pricing = (it.pricing && typeof it.pricing === 'object' ? it.pricing : {}) as Record<string, unknown>;
    const avail = (it.availability && typeof it.availability === 'object' ? it.availability : {}) as Record<string, unknown>;
    const restr = (it.restrictions && typeof it.restrictions === 'object' ? it.restrictions : {}) as Record<string, unknown>;
    const photos = Array.isArray(it.photos) ? (it.photos as unknown[]) : [];
    setEditing({
      id: it.id,
      name: it.name ?? '',
      category: it.category ?? 'other',
      price: pricing.amount != null ? String(pricing.amount) : (pricing.price != null ? String(pricing.price) : ''),
      price_basis: typeof pricing.basis === 'string' ? pricing.basis : 'per_event',
      audience_size: it.audience_size != null ? String(it.audience_size) : '',
      impression_estimate: it.impression_estimate != null ? String(it.impression_estimate) : '',
      availability_notes: typeof avail.notes === 'string' ? avail.notes : '',
      restrictions_notes: typeof restr.notes === 'string' ? restr.notes : '',
      photo_url: typeof photos[0] === 'string' ? (photos[0] as string) : '',
    });
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) { setErr('Name is required'); return; }
    setBusy(true);
    setErr(null);
    const amount = num(editing.price);
    const body: Record<string, unknown> = {
      name: editing.name.trim(),
      category: editing.category,
      pricing: amount != null ? { amount, basis: editing.price_basis } : null,
      availability: editing.availability_notes.trim() ? { notes: editing.availability_notes.trim() } : null,
      restrictions: editing.restrictions_notes.trim() ? { notes: editing.restrictions_notes.trim() } : null,
      photos: editing.photo_url.trim() ? [editing.photo_url.trim()] : null,
      audience_size: num(editing.audience_size),
      impression_estimate: num(editing.impression_estimate),
    };
    try {
      if (editing.id) {
        await apiSend('PATCH', `/revenue-inventory/${editing.id}`, body);
      } else {
        await apiSend('POST', `/revenue-inventory`, { ...body, venue_id: venueId });
      }
      setEditing(null);
      await load(venueId);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this inventory item?')) return;
    setBusy(true);
    try {
      await apiSend('DELETE', `/revenue-inventory/${id}`);
      await load(venueId);
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
          <h1>Revenue Inventory</h1>
          <div className="sub">Monetizable surfaces and spaces at your venue</div>
        </div>
        {venueId && <button className="btn primary" onClick={startCreate}>+ Add inventory</button>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 280px' }}>
            <div className="note" style={{ marginBottom: 6 }}>Venue ID</div>
            <input
              value={venueInput}
              onChange={(e) => setVenueInput(e.target.value)}
              placeholder="Paste the venue id to manage its inventory"
              style={{ width: '100%' }}
            />
          </label>
          <button className="btn" onClick={applyVenue}>Load inventory</button>
        </div>
        <p className="note" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          Inventory is scoped to the venue your organization owns. Screens, walls,
          elevators, pool, rooftop, keycards, VIP, registration, and parking can all
          carry pricing, availability, audience, and impression estimates.
        </p>
      </div>

      {err && <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>}

      {!venueId ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Enter a venue id above to manage its revenue inventory.</p></div>
      ) : loading ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading inventory...</p></div>
      ) : items.length === 0 ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>No inventory yet. Add your first monetizable surface to get started.</p></div>
      ) : (
        <div className="grid cards3">
          {items.map((it) => (
            <div className="card" key={it.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <h3 style={{ margin: 0 }}>{it.name}</h3>
                <span className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>{it.category ?? 'other'}</span>
              </div>
              <div style={{ margin: '8px 0', fontWeight: 600 }}>{pricingSummary(it.pricing)}</div>
              <div className="note" style={{ lineHeight: 1.7 }}>
                <div>Audience: {it.audience_size != null ? it.audience_size.toLocaleString() : '-'}</div>
                <div>Impressions: {it.impression_estimate != null ? it.impression_estimate.toLocaleString() : '-'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn" onClick={() => startEdit(it)}>Edit</button>
                <button className="btn" onClick={() => remove(it.id)} disabled={busy}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="sectitle">{editing.id ? 'Edit inventory item' : 'New inventory item'}</div>
          <div className="grid cards2" style={{ gap: 12 }}>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Name</div>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ width: '100%' }} placeholder="Lobby video wall" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Category</div>
              <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} style={{ width: '100%' }}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Price</div>
              <input value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} style={{ width: '100%' }} placeholder="5000" inputMode="decimal" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Price basis</div>
              <select value={editing.price_basis} onChange={(e) => setEditing({ ...editing, price_basis: e.target.value })} style={{ width: '100%' }}>
                {PRICE_BASIS.map((b) => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
              </select>
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Audience size</div>
              <input value={editing.audience_size} onChange={(e) => setEditing({ ...editing, audience_size: e.target.value })} style={{ width: '100%' }} placeholder="2500" inputMode="numeric" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Impression estimate</div>
              <input value={editing.impression_estimate} onChange={(e) => setEditing({ ...editing, impression_estimate: e.target.value })} style={{ width: '100%' }} placeholder="40000" inputMode="numeric" />
            </label>
            <label>
              <div className="note" style={{ marginBottom: 6 }}>Photo URL</div>
              <input value={editing.photo_url} onChange={(e) => setEditing({ ...editing, photo_url: e.target.value })} style={{ width: '100%' }} placeholder="https://..." />
            </label>
          </div>
          <label style={{ display: 'block', marginTop: 12 }}>
            <div className="note" style={{ marginBottom: 6 }}>Availability notes</div>
            <textarea value={editing.availability_notes} onChange={(e) => setEditing({ ...editing, availability_notes: e.target.value })} style={{ width: '100%', minHeight: 60 }} placeholder="Available outside of black-out dates; 2 week lead time" />
          </label>
          <label style={{ display: 'block', marginTop: 12 }}>
            <div className="note" style={{ marginBottom: 6 }}>Restrictions</div>
            <textarea value={editing.restrictions_notes} onChange={(e) => setEditing({ ...editing, restrictions_notes: e.target.value })} style={{ width: '100%', minHeight: 60 }} placeholder="No alcohol or tobacco branding; fire-marshal approval required" />
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
            <button className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
