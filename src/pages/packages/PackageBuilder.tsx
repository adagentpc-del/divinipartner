import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';

// Phase 4 - Package / Bundle builder (blueprint 17). Build named bundles of
// inventory items + services with bundle pricing.

type PackageItemLine = {
  kind: 'inventory' | 'service';
  ref_id?: string;
  name?: string;
  quantity?: number;
  unit_price?: number;
};

type Pkg = {
  id: string;
  name?: string;
  description?: string;
  category?: string;
  items?: PackageItemLine[];
  bundle_price?: number;
  delivery_fee?: number;
  install_fee?: number;
  labor_hours?: number;
  serves?: number;
  status?: string;
};

type InventoryItem = { id: string; name?: string; price?: number };

const EMPTY: Partial<Pkg> = { name: '', description: '', category: '', items: [], status: 'draft' };

function money(n?: number) {
  if (n == null || Number.isNaN(Number(n))) return '$0';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function lineTotal(items?: PackageItemLine[]) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, it) => s + (Number(it.unit_price) || 0) * (Number(it.quantity) || 1), 0);
}

export default function PackageBuilder() {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [editing, setEditing] = useState<Partial<Pkg> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [pk, iv] = await Promise.all([
        apiGet<{ packages: Pkg[] }>('/packages'),
        apiGet<{ items: InventoryItem[] }>('/inventory?status=active'),
      ]);
      setPackages(pk.packages || []);
      setInventory(iv.items || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function field<K extends keyof Pkg>(key: K, value: Pkg[K]) {
    setEditing((e) => ({ ...(e || {}), [key]: value }));
  }

  function addLine() {
    setEditing((e) => ({ ...(e || {}), items: [...((e?.items as PackageItemLine[]) || []), { kind: 'inventory', quantity: 1 }] }));
  }

  function updateLine(idx: number, patch: Partial<PackageItemLine>) {
    setEditing((e) => {
      const items = [...((e?.items as PackageItemLine[]) || [])];
      items[idx] = { ...items[idx], ...patch };
      return { ...(e || {}), items };
    });
  }

  function removeLine(idx: number) {
    setEditing((e) => {
      const items = [...((e?.items as PackageItemLine[]) || [])];
      items.splice(idx, 1);
      return { ...(e || {}), items };
    });
  }

  function pickInventory(idx: number, id: string) {
    const found = inventory.find((i) => i.id === id);
    updateLine(idx, { ref_id: id, name: found?.name, unit_price: found?.price ?? 0, kind: 'inventory' });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) await apiSend('PUT', `/packages/${editing.id}`, editing);
      else await apiSend('POST', '/packages', editing);
      setEditing(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this package?')) return;
    try {
      await apiSend('DELETE', `/packages/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const draftItems = (editing?.items as PackageItemLine[]) || [];
  const computed = lineTotal(draftItems);

  return (
    <div className="pkg">
      <style>{CSS}</style>

      <header className="pkg-head">
        <div>
          <span className="pkg-kicker">Vendor Workspace</span>
          <h1 className="pkg-title">Package Builder</h1>
          <p className="pkg-sub">Bundle inventory and services into named packages with bundle pricing.</p>
        </div>
        <button type="button" className="pkg-btn" onClick={() => setEditing({ ...EMPTY })}>New package</button>
      </header>

      {error && <div className="pkg-error">{error}</div>}

      {loading ? (
        <div className="pkg-empty">Loading packages.</div>
      ) : packages.length === 0 ? (
        <div className="pkg-empty">No packages yet. Build your first bundle to speed up quoting.</div>
      ) : (
        <div className="pkg-list">
          {packages.map((p) => (
            <article key={p.id} className="pkg-card">
              <div className="pkg-row-top">
                <h3>{p.name || 'Untitled package'}</h3>
                {p.status && <span className={`pkg-tag ${p.status}`}>{p.status}</span>}
              </div>
              {p.category && <p className="pkg-cat">{p.category}</p>}
              {p.description && <p className="pkg-desc">{p.description}</p>}
              <p className="pkg-price">{money(p.bundle_price ?? lineTotal(p.items))} <em>bundle</em></p>
              <p className="pkg-meta">{(p.items || []).length} line item{(p.items || []).length === 1 ? '' : 's'}{p.serves ? ` · serves ${p.serves}` : ''}</p>
              <div className="pkg-actions">
                <button type="button" className="pkg-btn ghost" onClick={() => setEditing(p)}>Edit</button>
                <button type="button" className="pkg-btn danger" onClick={() => remove(p.id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className="pkg-modal" role="dialog" aria-modal="true">
          <div className="pkg-modal-card">
            <h2>{editing.id ? 'Edit package' : 'New package'}</h2>
            <div className="pkg-form">
              <label>Name<input value={editing.name || ''} onChange={(e) => field('name', e.target.value)} /></label>
              <label>Category<input value={editing.category || ''} onChange={(e) => field('category', e.target.value)} /></label>
              <label className="pkg-full">Description<textarea value={editing.description || ''} onChange={(e) => field('description', e.target.value)} /></label>
              <label>Bundle price (blank = sum of lines)<input type="number" value={editing.bundle_price ?? ''} onChange={(e) => field('bundle_price', e.target.value === '' ? undefined : Number(e.target.value))} /></label>
              <label>Serves (guests)<input type="number" value={editing.serves ?? ''} onChange={(e) => field('serves', Number(e.target.value))} /></label>
              <label>Delivery fee<input type="number" value={editing.delivery_fee ?? ''} onChange={(e) => field('delivery_fee', Number(e.target.value))} /></label>
              <label>Install fee<input type="number" value={editing.install_fee ?? ''} onChange={(e) => field('install_fee', Number(e.target.value))} /></label>
              <label>Labor hours<input type="number" value={editing.labor_hours ?? ''} onChange={(e) => field('labor_hours', Number(e.target.value))} /></label>
              <label>Status
                <select value={editing.status || 'draft'} onChange={(e) => field('status', e.target.value)}>
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
              </label>
            </div>

            <div className="pkg-lines">
              <div className="pkg-lines-head">
                <strong>Line items</strong>
                <button type="button" className="pkg-btn ghost sm" onClick={addLine}>Add line</button>
              </div>
              {draftItems.length === 0 && <p className="pkg-muted">No line items yet.</p>}
              {draftItems.map((li, idx) => (
                <div key={idx} className="pkg-line">
                  <select value={li.kind} onChange={(e) => updateLine(idx, { kind: e.target.value as PackageItemLine['kind'] })}>
                    <option value="inventory">inventory</option>
                    <option value="service">service</option>
                  </select>
                  {li.kind === 'inventory' ? (
                    <select value={li.ref_id || ''} onChange={(e) => pickInventory(idx, e.target.value)}>
                      <option value="">Select item</option>
                      {inventory.map((iv) => <option key={iv.id} value={iv.id}>{iv.name}</option>)}
                    </select>
                  ) : (
                    <input placeholder="Service name" value={li.name || ''} onChange={(e) => updateLine(idx, { name: e.target.value })} />
                  )}
                  <input type="number" placeholder="Qty" value={li.quantity ?? 1} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} />
                  <input type="number" placeholder="Unit $" value={li.unit_price ?? 0} onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) })} />
                  <span className="pkg-line-total">{money((Number(li.unit_price) || 0) * (Number(li.quantity) || 1))}</span>
                  <button type="button" className="pkg-x" onClick={() => removeLine(idx)} aria-label="Remove line">x</button>
                </div>
              ))}
              <div className="pkg-computed">Line total: <strong>{money(computed)}</strong>{editing.bundle_price != null && editing.bundle_price !== undefined ? ` · bundle price ${money(editing.bundle_price)}` : ''}</div>
            </div>

            <div className="pkg-modal-actions">
              <button type="button" className="pkg-btn ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="pkg-btn" disabled={saving} onClick={save}>{saving ? 'Saving.' : 'Save package'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.pkg { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.pkg *,.pkg *::before,.pkg *::after { box-sizing:border-box; }
.pkg h1,.pkg h2,.pkg h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.pkg-head { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:20px; flex-wrap:wrap; }
.pkg-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.pkg-title { font-size:28px; color:var(--e); line-height:1.1; }
.pkg-sub { font-size:13px; color:var(--mut); margin:4px 0 0; }
.pkg-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.pkg-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.pkg-list { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
.pkg-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; }
.pkg-row-top { display:flex; align-items:center; gap:10px; }
.pkg-card h3 { font-size:19px; color:var(--e); }
.pkg-tag { font-size:10px; letter-spacing:.5px; text-transform:uppercase; padding:2px 8px; border-radius:999px; font-weight:600; }
.pkg-tag.active { background:rgba(30,93,74,.12); color:var(--e2); }
.pkg-tag.draft { background:rgba(201,163,91,.2); color:#7a5e22; }
.pkg-tag.archived { background:rgba(125,119,108,.16); color:var(--mut); }
.pkg-cat { font-size:11.5px; color:var(--g); font-weight:600; text-transform:capitalize; margin:3px 0 6px; }
.pkg-desc { font-size:12.5px; color:var(--mut); margin:0 0 8px; line-height:1.5; }
.pkg-price { font-size:18px; color:var(--e); font-weight:600; margin:0 0 2px; }
.pkg-price em { color:var(--mut); font-style:normal; font-size:11.5px; font-weight:400; }
.pkg-meta { font-size:11.5px; color:var(--mut); margin:0 0 12px; }
.pkg-actions { display:flex; gap:8px; }
.pkg-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:8px 16px; cursor:pointer; }
.pkg-btn:hover { background:var(--e2); }
.pkg-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.pkg-btn.ghost.sm { padding:5px 12px; font-size:11.5px; }
.pkg-btn.danger { background:transparent; color:#9a3a28; border:1px solid #e7b7ab; }
.pkg-btn:disabled { opacity:.6; cursor:default; }
.pkg-modal { position:fixed; inset:0; background:rgba(18,60,46,.4); display:grid; place-items:center; padding:20px; z-index:50; }
.pkg-modal-card { background:#fff; border-radius:16px; padding:24px; width:100%; max-width:760px; max-height:90vh; overflow:auto; }
.pkg-modal-card h2 { font-size:24px; color:var(--e); margin-bottom:16px; }
.pkg-form { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.pkg-form label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.pkg-form .pkg-full { grid-column:1 / -1; }
.pkg-form input,.pkg-form select,.pkg-form textarea { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.pkg-form textarea { min-height:60px; resize:vertical; }
.pkg-lines { margin-top:18px; border-top:1px solid var(--ln); padding-top:16px; }
.pkg-lines-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
.pkg-muted { color:var(--mut); font-size:12.5px; }
.pkg-line { display:grid; grid-template-columns:110px 1fr 70px 90px auto 28px; gap:8px; align-items:center; margin-bottom:8px; }
.pkg-line select,.pkg-line input { font:inherit; font-size:12.5px; padding:7px 9px; border:1px solid var(--ln); border-radius:8px; background:#fff; min-width:0; }
.pkg-line-total { font-size:12.5px; font-weight:600; color:var(--e); text-align:right; }
.pkg-x { background:transparent; border:1px solid var(--ln); border-radius:8px; cursor:pointer; color:var(--mut); width:28px; height:30px; }
.pkg-computed { font-size:13px; color:var(--mut); margin-top:10px; }
.pkg-computed strong { color:var(--e); }
.pkg-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
@media (max-width:980px){ .pkg-list { grid-template-columns:repeat(2,1fr); } }
@media (max-width:680px){ .pkg-list { grid-template-columns:1fr; } .pkg-form { grid-template-columns:1fr; } .pkg-line { grid-template-columns:1fr 1fr; } }
`;
