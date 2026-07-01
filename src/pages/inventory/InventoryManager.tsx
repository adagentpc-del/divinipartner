import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';

// Phase 4 - Rental Inventory manager (blueprint 12.2). List, add, and edit
// inventory items with the full field set, photo placeholders, and availability.

type InventoryItem = {
  id: string;
  name?: string;
  category?: string;
  description?: string;
  dimensions?: string;
  weight?: string;
  quantity?: number;
  price?: number;
  price_unit?: string;
  delivery_fee?: number;
  install_fee?: number;
  labor_required?: boolean;
  labor_hours?: number;
  damage_deposit?: number;
  replacement_value?: number;
  warehouse_location?: string;
  service_radius?: number;
  lead_time?: string;
  venue_restrictions?: string[];
  contract_pricing_eligible?: boolean;
  status?: string;
  photos?: unknown;
};

type AvailabilityWindow = {
  id: string;
  start_date: string;
  end_date?: string;
  quantity_available?: number;
  quantity_reserved?: number;
  quantity_pending?: number;
  buffer?: number;
};

const PRICE_UNITS = ['per_day', 'per_event', 'per_unit', 'per_hour'];
const EMPTY: Partial<InventoryItem> = {
  name: '', category: '', description: '', price_unit: 'per_day', status: 'active',
  labor_required: false, contract_pricing_eligible: false,
};

function money(n?: number) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export default function InventoryManager() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<InventoryItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [avail, setAvail] = useState<Record<string, AvailabilityWindow[]>>({});

  async function load() {
    setLoading(true);
    try {
      const res = await apiGet<{ items: InventoryItem[] }>('/inventory');
      setItems(res.items || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const body = { ...editing };
      if (editing.id) {
        await apiSend('PUT', `/inventory/${editing.id}`, body);
      } else {
        await apiSend('POST', '/inventory', body);
      }
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this inventory item?')) return;
    try {
      await apiSend('DELETE', `/inventory/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadAvailability(id: string) {
    try {
      const res = await apiGet<{ availability: AvailabilityWindow[] }>(`/inventory/${id}/availability`);
      setAvail((a) => ({ ...a, [id]: res.availability || [] }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function field<K extends keyof InventoryItem>(key: K, value: InventoryItem[K]) {
    setEditing((e) => ({ ...(e || {}), [key]: value }));
  }

  return (
    <div className="inv">
      <style>{CSS}</style>

      <header className="inv-head">
        <div>
          <span className="inv-kicker">Vendor Workspace</span>
          <h1 className="inv-title">Rental Inventory</h1>
          <p className="inv-sub">Manage the items you rent for events, with pricing, logistics, and availability.</p>
        </div>
        <button className="inv-btn" type="button" onClick={() => setEditing({ ...EMPTY })}>Add item</button>
      </header>

      {error && <div className="inv-error">{error}</div>}

      {loading ? (
        <div className="inv-empty">Loading inventory.</div>
      ) : items.length === 0 ? (
        <div className="inv-empty">No inventory yet. Add your first rental item to get started.</div>
      ) : (
        <div className="inv-list">
          {items.map((it) => (
            <article key={it.id} className="inv-card">
              <div className="inv-photo" aria-hidden="true">{(it.name || 'I').slice(0, 1).toUpperCase()}</div>
              <div className="inv-body">
                <div className="inv-row-top">
                  <h3>{it.name || 'Untitled item'}</h3>
                  {it.status && <span className={`inv-tag ${it.status}`}>{it.status}</span>}
                </div>
                <p className="inv-cat">{it.category || 'Uncategorized'}</p>
                {it.description && <p className="inv-desc">{it.description}</p>}
                <div className="inv-facts">
                  <span>{money(it.price)} <em>{it.price_unit || ''}</em></span>
                  <span>Qty {it.quantity ?? '-'}</span>
                  {it.delivery_fee != null && <span>Delivery {money(it.delivery_fee)}</span>}
                  {it.install_fee != null && <span>Install {money(it.install_fee)}</span>}
                  {it.labor_required && <span>Labor {it.labor_hours ?? '-'}h</span>}
                  {it.damage_deposit != null && <span>Deposit {money(it.damage_deposit)}</span>}
                  {it.warehouse_location && <span>{it.warehouse_location}</span>}
                  {it.lead_time && <span>Lead {it.lead_time}</span>}
                  {it.contract_pricing_eligible && <span className="inv-pill">Contract eligible</span>}
                </div>
                <div className="inv-actions">
                  <button type="button" className="inv-btn ghost" onClick={() => setEditing(it)}>Edit</button>
                  <button type="button" className="inv-btn ghost" onClick={() => loadAvailability(it.id)}>Availability</button>
                  <button type="button" className="inv-btn danger" onClick={() => remove(it.id)}>Remove</button>
                </div>
                {avail[it.id] && (
                  <div className="inv-avail">
                    <strong>Availability windows</strong>
                    {avail[it.id].length === 0 ? (
                      <p>No date windows. The base quantity ({it.quantity ?? 0}) applies.</p>
                    ) : (
                      <ul>
                        {avail[it.id].map((w) => (
                          <li key={w.id}>
                            {w.start_date}{w.end_date ? ` to ${w.end_date}` : ''} :
                            avail {w.quantity_available ?? 0}, reserved {w.quantity_reserved ?? 0},
                            pending {w.quantity_pending ?? 0}, buffer {w.buffer ?? 0}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className="inv-modal" role="dialog" aria-modal="true">
          <div className="inv-modal-card">
            <h2>{editing.id ? 'Edit item' : 'Add item'}</h2>
            <div className="inv-form">
              <label>Name<input value={editing.name || ''} onChange={(e) => field('name', e.target.value)} /></label>
              <label>Category<input value={editing.category || ''} onChange={(e) => field('category', e.target.value)} /></label>
              <label className="inv-full">Description<textarea value={editing.description || ''} onChange={(e) => field('description', e.target.value)} /></label>
              <label>Dimensions<input value={editing.dimensions || ''} onChange={(e) => field('dimensions', e.target.value)} /></label>
              <label>Weight<input value={editing.weight || ''} onChange={(e) => field('weight', e.target.value)} /></label>
              <label>Quantity available<input type="number" value={editing.quantity ?? ''} onChange={(e) => field('quantity', Number(e.target.value))} /></label>
              <label>Rental price<input type="number" value={editing.price ?? ''} onChange={(e) => field('price', Number(e.target.value))} /></label>
              <label>Price unit
                <select value={editing.price_unit || 'per_day'} onChange={(e) => field('price_unit', e.target.value)}>
                  {PRICE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </label>
              <label>Delivery fee<input type="number" value={editing.delivery_fee ?? ''} onChange={(e) => field('delivery_fee', Number(e.target.value))} /></label>
              <label>Install fee<input type="number" value={editing.install_fee ?? ''} onChange={(e) => field('install_fee', Number(e.target.value))} /></label>
              <label className="inv-check"><input type="checkbox" checked={!!editing.labor_required} onChange={(e) => field('labor_required', e.target.checked)} /> Labor required</label>
              <label>Labor hours<input type="number" value={editing.labor_hours ?? ''} onChange={(e) => field('labor_hours', Number(e.target.value))} /></label>
              <label>Damage deposit<input type="number" value={editing.damage_deposit ?? ''} onChange={(e) => field('damage_deposit', Number(e.target.value))} /></label>
              <label>Replacement value<input type="number" value={editing.replacement_value ?? ''} onChange={(e) => field('replacement_value', Number(e.target.value))} /></label>
              <label>Warehouse location<input value={editing.warehouse_location || ''} onChange={(e) => field('warehouse_location', e.target.value)} /></label>
              <label>Service radius (mi)<input type="number" value={editing.service_radius ?? ''} onChange={(e) => field('service_radius', Number(e.target.value))} /></label>
              <label>Lead time<input value={editing.lead_time || ''} onChange={(e) => field('lead_time', e.target.value)} /></label>
              <label className="inv-full">Venue restrictions (comma separated)
                <input
                  value={(editing.venue_restrictions || []).join(', ')}
                  onChange={(e) => field('venue_restrictions', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                />
              </label>
              <label className="inv-check"><input type="checkbox" checked={!!editing.contract_pricing_eligible} onChange={(e) => field('contract_pricing_eligible', e.target.checked)} /> Contract pricing eligible</label>
              <label>Status
                <select value={editing.status || 'active'} onChange={(e) => field('status', e.target.value)}>
                  <option value="active">active</option>
                  <option value="unavailable">unavailable</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <div className="inv-full inv-photoslot" aria-hidden="true">
                <span>Photo upload placeholder</span>
                <small>Drag images here in a future release.</small>
              </div>
            </div>
            <div className="inv-modal-actions">
              <button type="button" className="inv-btn ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="inv-btn" disabled={saving} onClick={save}>{saving ? 'Saving.' : 'Save item'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.inv { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.inv *,.inv *::before,.inv *::after { box-sizing:border-box; }
.inv h1,.inv h2,.inv h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.inv-head { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:20px; flex-wrap:wrap; }
.inv-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.inv-title { font-size:28px; color:var(--e); line-height:1.1; }
.inv-sub { font-size:13px; color:var(--mut); margin:4px 0 0; }
.inv-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.inv-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.inv-list { display:flex; flex-direction:column; gap:14px; }
.inv-card { display:flex; gap:16px; background:#fff; border:1px solid var(--ln); border-radius:14px; padding:16px; }
.inv-photo { width:72px; height:72px; flex:0 0 72px; border-radius:11px; background:linear-gradient(135deg,var(--g),#b58e44); color:var(--e); display:flex; align-items:center; justify-content:center; font-family:'Cormorant Garamond',serif; font-weight:700; font-size:28px; }
.inv-body { flex:1 1 auto; min-width:0; }
.inv-row-top { display:flex; align-items:center; gap:10px; }
.inv-card h3 { font-size:20px; color:var(--e); }
.inv-tag { font-size:10px; letter-spacing:.5px; text-transform:uppercase; padding:2px 8px; border-radius:999px; font-weight:600; }
.inv-tag.active { background:rgba(30,93,74,.12); color:var(--e2); }
.inv-tag.archived,.inv-tag.unavailable { background:rgba(125,119,108,.16); color:var(--mut); }
.inv-cat { font-size:12px; color:var(--g); font-weight:600; margin:2px 0 4px; text-transform:capitalize; }
.inv-desc { font-size:12.5px; color:var(--mut); margin:0 0 8px; line-height:1.5; }
.inv-facts { display:flex; flex-wrap:wrap; gap:8px 14px; font-size:12px; color:var(--ink); }
.inv-facts em { color:var(--mut); font-style:normal; }
.inv-pill { background:rgba(201,163,91,.18); color:var(--e); padding:1px 8px; border-radius:999px; font-weight:600; }
.inv-actions { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
.inv-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:8px 16px; cursor:pointer; }
.inv-btn:hover { background:var(--e2); }
.inv-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.inv-btn.ghost:hover { border-color:var(--e); }
.inv-btn.danger { background:transparent; color:#9a3a28; border:1px solid #e7b7ab; }
.inv-btn:disabled { opacity:.6; cursor:default; }
.inv-avail { margin-top:12px; padding:12px; background:var(--iv); border-radius:10px; font-size:12px; color:var(--mut); }
.inv-avail strong { color:var(--ink); display:block; margin-bottom:6px; }
.inv-avail ul { margin:0; padding-left:18px; display:flex; flex-direction:column; gap:4px; }
.inv-modal { position:fixed; inset:0; background:rgba(18,60,46,.4); display:grid; place-items:center; padding:20px; z-index:50; }
.inv-modal-card { background:#fff; border-radius:16px; padding:24px; width:100%; max-width:760px; max-height:90vh; overflow:auto; }
.inv-modal-card h2 { font-size:24px; color:var(--e); margin-bottom:16px; }
.inv-form { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.inv-form label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.inv-form .inv-full { grid-column:1 / -1; }
.inv-form input,.inv-form select,.inv-form textarea { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.inv-form textarea { min-height:64px; resize:vertical; }
.inv-check { flex-direction:row !important; align-items:center; gap:8px; }
.inv-check input { width:auto; }
.inv-photoslot { border:1px dashed var(--ln); border-radius:11px; padding:18px; text-align:center; color:var(--mut); display:flex; flex-direction:column; gap:2px; background:var(--iv); }
.inv-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
@media (max-width:680px){ .inv-form { grid-template-columns:1fr; } .inv-card { flex-direction:column; } }
`;
