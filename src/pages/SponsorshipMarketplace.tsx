import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

/**
 * Phase 5 - Sponsorship Inventory Marketplace (Venue Intelligence addendum data
 * model 11). Two modes in one page:
 *   - Browse: the OPEN sponsorship opportunities across every venue, for
 *     sponsors shopping the marketplace (read only, cross-org via /sponsorships/browse).
 *   - Manage: a venue manages its own packaged sponsorship opportunities
 *     (CRUD, venue-scoped + IDOR-safe via /sponsorships).
 *
 * The managed venue id comes from ?venue=<id> (remembered in localStorage).
 */

type Sponsorship = {
  id: string;
  venue_id?: string | null;
  name: string;
  category?: string | null;
  audience_size?: number | null;
  impression_estimate?: number | null;
  pricing?: unknown;
  deliverables?: unknown;
  availability?: unknown;
  photos?: unknown;
  performance_history?: unknown;
  status?: string | null;
  created_at?: string;
  updated_at?: string;
};

const CATEGORIES = [
  'title', 'presenting', 'naming_rights', 'activation', 'digital', 'hospitality',
  'signage', 'experiential', 'product_sampling', 'content', 'other',
];

const STATUSES = ['open', 'paused', 'closed', 'draft'];
const PRICE_BASIS = ['per_event', 'per_season', 'per_year', 'flat'];

const VENUE_KEY = 'dp.vi.venueId';

type EditState = {
  id?: string;
  name: string;
  category: string;
  status: string;
  price: string;
  price_basis: string;
  audience_size: string;
  impression_estimate: string;
  deliverables: string;
  availability_notes: string;
  photo_url: string;
};

const EMPTY: EditState = {
  name: '', category: 'presenting', status: 'open', price: '', price_basis: 'per_event',
  audience_size: '', impression_estimate: '', deliverables: '', availability_notes: '', photo_url: '',
};

function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return '-';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function pricingSummary(p: unknown): string {
  if (!p || typeof p !== 'object') return 'Contact for pricing';
  const rec = p as Record<string, unknown>;
  const amount = rec.amount ?? rec.price;
  if (amount == null) return 'Contact for pricing';
  const basis = typeof rec.basis === 'string' ? rec.basis.replace(/_/g, ' ') : '';
  return `${money(amount)}${basis ? ` ${basis}` : ''}`;
}

function deliverablesList(d: unknown): string[] {
  if (Array.isArray(d)) return d.filter((x) => typeof x === 'string') as string[];
  return [];
}

function num(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function SponsorshipMarketplace() {
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<'browse' | 'manage'>('browse');

  // Browse state
  const [browseRows, setBrowseRows] = useState<Sponsorship[]>([]);
  const [browseCat, setBrowseCat] = useState<string>('All');
  const [browseLoading, setBrowseLoading] = useState(false);

  // Manage state
  const initialVenue = params.get('venue') || localStorage.getItem(VENUE_KEY) || '';
  const [venueId, setVenueId] = useState<string>(initialVenue);
  const [venueInput, setVenueInput] = useState<string>(initialVenue);
  const [manageRows, setManageRows] = useState<Sponsorship[]>([]);
  const [manageLoading, setManageLoading] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadBrowse() {
    setBrowseLoading(true);
    setErr(null);
    try {
      const qs = browseCat !== 'All' ? `?category=${encodeURIComponent(browseCat)}` : '';
      const r = await apiGet<{ opportunities: Sponsorship[] }>(`/sponsorships/browse${qs}`);
      setBrowseRows(r.opportunities ?? []);
    } catch (e) {
      setErr((e as Error).message);
      setBrowseRows([]);
    } finally {
      setBrowseLoading(false);
    }
  }

  async function loadManage(id: string) {
    if (!id) { setManageRows([]); return; }
    setManageLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ opportunities: Sponsorship[] }>(`/sponsorships?venue=${encodeURIComponent(id)}`);
      setManageRows(r.opportunities ?? []);
    } catch (e) {
      setErr((e as Error).message);
      setManageRows([]);
    } finally {
      setManageLoading(false);
    }
  }

  useEffect(() => { if (mode === 'browse') void loadBrowse(); }, [mode, browseCat]);
  useEffect(() => { if (mode === 'manage') void loadManage(venueId); }, [mode, venueId]);

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

  function startEdit(s: Sponsorship) {
    const pricing = (s.pricing && typeof s.pricing === 'object' ? s.pricing : {}) as Record<string, unknown>;
    const avail = (s.availability && typeof s.availability === 'object' ? s.availability : {}) as Record<string, unknown>;
    const photos = Array.isArray(s.photos) ? (s.photos as unknown[]) : [];
    setEditing({
      id: s.id,
      name: s.name ?? '',
      category: s.category ?? 'other',
      status: s.status ?? 'open',
      price: pricing.amount != null ? String(pricing.amount) : (pricing.price != null ? String(pricing.price) : ''),
      price_basis: typeof pricing.basis === 'string' ? pricing.basis : 'per_event',
      audience_size: s.audience_size != null ? String(s.audience_size) : '',
      impression_estimate: s.impression_estimate != null ? String(s.impression_estimate) : '',
      deliverables: deliverablesList(s.deliverables).join('\n'),
      availability_notes: typeof avail.notes === 'string' ? avail.notes : '',
      photo_url: typeof photos[0] === 'string' ? (photos[0] as string) : '',
    });
  }

  async function save() {
    if (!editing) return;
    if (!editing.name.trim()) { setErr('Name is required'); return; }
    setBusy(true);
    setErr(null);
    const amount = num(editing.price);
    const deliverables = editing.deliverables.split('\n').map((d) => d.trim()).filter(Boolean);
    const body: Record<string, unknown> = {
      name: editing.name.trim(),
      category: editing.category,
      status: editing.status,
      pricing: amount != null ? { amount, basis: editing.price_basis } : null,
      deliverables: deliverables.length ? deliverables : null,
      availability: editing.availability_notes.trim() ? { notes: editing.availability_notes.trim() } : null,
      photos: editing.photo_url.trim() ? [editing.photo_url.trim()] : null,
      audience_size: num(editing.audience_size),
      impression_estimate: num(editing.impression_estimate),
    };
    try {
      if (editing.id) {
        await apiSend('PATCH', `/sponsorships/${editing.id}`, body);
      } else {
        await apiSend('POST', `/sponsorships`, { ...body, venue_id: venueId });
      }
      setEditing(null);
      await loadManage(venueId);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this sponsorship opportunity?')) return;
    setBusy(true);
    try {
      await apiSend('DELETE', `/sponsorships/${id}`);
      await loadManage(venueId);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const browseChips = ['All', ...CATEGORIES];

  function card(s: Sponsorship, managed: boolean) {
    const dels = deliverablesList(s.deliverables);
    return (
      <div className="card" key={s.id}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h3 style={{ margin: 0 }}>{s.name}</h3>
          <span className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>{s.category ?? 'other'}</span>
        </div>
        <div style={{ margin: '8px 0', fontWeight: 600 }}>{pricingSummary(s.pricing)}</div>
        <div className="note" style={{ lineHeight: 1.7 }}>
          <div>Audience: {s.audience_size != null ? s.audience_size.toLocaleString() : '-'}</div>
          <div>Impressions: {s.impression_estimate != null ? s.impression_estimate.toLocaleString() : '-'}</div>
          {managed && <div>Status: {s.status ?? 'open'}</div>}
        </div>
        {dels.length > 0 && (
          <ul className="note" style={{ margin: '8px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
            {dels.slice(0, 4).map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        )}
        {managed && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={() => startEdit(s)}>Edit</button>
            <button className="btn" onClick={() => remove(s.id)} disabled={busy}>Delete</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sponsorship Marketplace</h1>
          <div className="sub">Discover and package venue sponsorship opportunities</div>
        </div>
        {mode === 'manage' && venueId && <button className="btn primary" onClick={startCreate}>+ Add opportunity</button>}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={'btn' + (mode === 'browse' ? ' primary' : '')} onClick={() => setMode('browse')}>Browse</button>
          <button className={'btn' + (mode === 'manage' ? ' primary' : '')} onClick={() => setMode('manage')}>Manage my venue</button>
        </div>
      </div>

      {err && <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>}

      {mode === 'browse' ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {browseChips.map((c) => (
                <button key={c} className={'btn' + (browseCat === c ? ' primary' : '')} onClick={() => setBrowseCat(c)} style={{ fontSize: 13 }}>
                  {c === 'All' ? 'All' : c.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
          {browseLoading ? (
            <div className="card"><p className="note" style={{ margin: 0 }}>Loading opportunities...</p></div>
          ) : browseRows.length === 0 ? (
            <div className="card"><p className="note" style={{ margin: 0 }}>No open sponsorship opportunities in this category yet.</p></div>
          ) : (
            <div className="grid cards3">{browseRows.map((s) => card(s, false))}</div>
          )}
        </>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label style={{ flex: '1 1 280px' }}>
                <div className="note" style={{ marginBottom: 6 }}>Venue ID</div>
                <input value={venueInput} onChange={(e) => setVenueInput(e.target.value)} placeholder="Paste the venue id to manage its sponsorships" style={{ width: '100%' }} />
              </label>
              <button className="btn" onClick={applyVenue}>Load opportunities</button>
            </div>
            <p className="note" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
              Package your venue inventory into sponsorships with deliverables, reach,
              and pricing. Set a status of open to list it on the public marketplace browse.
            </p>
          </div>

          {!venueId ? (
            <div className="card"><p className="note" style={{ margin: 0 }}>Enter a venue id above to manage its sponsorship opportunities.</p></div>
          ) : manageLoading ? (
            <div className="card"><p className="note" style={{ margin: 0 }}>Loading opportunities...</p></div>
          ) : manageRows.length === 0 ? (
            <div className="card"><p className="note" style={{ margin: 0 }}>No sponsorship opportunities yet. Add your first package to get started.</p></div>
          ) : (
            <div className="grid cards3">{manageRows.map((s) => card(s, true))}</div>
          )}

          {editing && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="sectitle">{editing.id ? 'Edit opportunity' : 'New opportunity'}</div>
              <div className="grid cards2" style={{ gap: 12 }}>
                <label>
                  <div className="note" style={{ marginBottom: 6 }}>Name</div>
                  <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} style={{ width: '100%' }} placeholder="Presenting sponsor - Summer Series" />
                </label>
                <label>
                  <div className="note" style={{ marginBottom: 6 }}>Category</div>
                  <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} style={{ width: '100%' }}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <label>
                  <div className="note" style={{ marginBottom: 6 }}>Status</div>
                  <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })} style={{ width: '100%' }}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label>
                  <div className="note" style={{ marginBottom: 6 }}>Price</div>
                  <input value={editing.price} onChange={(e) => setEditing({ ...editing, price: e.target.value })} style={{ width: '100%' }} placeholder="25000" inputMode="decimal" />
                </label>
                <label>
                  <div className="note" style={{ marginBottom: 6 }}>Price basis</div>
                  <select value={editing.price_basis} onChange={(e) => setEditing({ ...editing, price_basis: e.target.value })} style={{ width: '100%' }}>
                    {PRICE_BASIS.map((b) => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <label>
                  <div className="note" style={{ marginBottom: 6 }}>Audience size</div>
                  <input value={editing.audience_size} onChange={(e) => setEditing({ ...editing, audience_size: e.target.value })} style={{ width: '100%' }} placeholder="12000" inputMode="numeric" />
                </label>
                <label>
                  <div className="note" style={{ marginBottom: 6 }}>Impression estimate</div>
                  <input value={editing.impression_estimate} onChange={(e) => setEditing({ ...editing, impression_estimate: e.target.value })} style={{ width: '100%' }} placeholder="250000" inputMode="numeric" />
                </label>
                <label>
                  <div className="note" style={{ marginBottom: 6 }}>Photo URL</div>
                  <input value={editing.photo_url} onChange={(e) => setEditing({ ...editing, photo_url: e.target.value })} style={{ width: '100%' }} placeholder="https://..." />
                </label>
              </div>
              <label style={{ display: 'block', marginTop: 12 }}>
                <div className="note" style={{ marginBottom: 6 }}>Deliverables (one per line)</div>
                <textarea value={editing.deliverables} onChange={(e) => setEditing({ ...editing, deliverables: e.target.value })} style={{ width: '100%', minHeight: 80 }} placeholder={'Logo on main stage screen\nNamed lounge activation\n4 VIP hospitality tables'} />
              </label>
              <label style={{ display: 'block', marginTop: 12 }}>
                <div className="note" style={{ marginBottom: 6 }}>Availability notes</div>
                <textarea value={editing.availability_notes} onChange={(e) => setEditing({ ...editing, availability_notes: e.target.value })} style={{ width: '100%', minHeight: 60 }} placeholder="One presenting slot per event; reserved through Q3" />
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
                <button className="btn" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
