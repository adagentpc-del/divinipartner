import React, { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';

// Phase 4 - filterable inventory browse view (blueprint 12.3).

type InventoryItem = {
  id: string;
  name?: string;
  category?: string;
  description?: string;
  price?: number;
  price_unit?: string;
  quantity?: number;
  delivery_fee?: number;
  install_fee?: number;
  labor_required?: boolean;
  warehouse_location?: string;
  lead_time?: string;
  contract_pricing_eligible?: boolean;
  status?: string;
};

type Filters = {
  search: string;
  category: string;
  minPrice: string;
  maxPrice: string;
  priceUnit: string;
  warehouseLocation: string;
  laborRequired: string;
  contractEligible: string;
  status: string;
  minQuantity: string;
};

const EMPTY_FILTERS: Filters = {
  search: '', category: '', minPrice: '', maxPrice: '', priceUnit: '',
  warehouseLocation: '', laborRequired: '', contractEligible: '', status: 'active', minQuantity: '',
};

function money(n?: number) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function buildQuery(f: Filters): string {
  const p = new URLSearchParams();
  if (f.search) p.set('search', f.search);
  if (f.category) p.set('category', f.category);
  if (f.minPrice) p.set('minPrice', f.minPrice);
  if (f.maxPrice) p.set('maxPrice', f.maxPrice);
  if (f.priceUnit) p.set('priceUnit', f.priceUnit);
  if (f.warehouseLocation) p.set('warehouseLocation', f.warehouseLocation);
  if (f.laborRequired) p.set('laborRequired', f.laborRequired);
  if (f.contractEligible) p.set('contractEligible', f.contractEligible);
  if (f.status) p.set('status', f.status);
  if (f.minQuantity) p.set('minQuantity', f.minQuantity);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

export default function InventorySearch() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(f: Filters) {
    setLoading(true);
    try {
      const res = await apiGet<{ items: InventoryItem[] }>(`/inventory${buildQuery(f)}`);
      setItems(res.items || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { run(EMPTY_FILTERS); }, []);

  function set<K extends keyof Filters>(key: K, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="invs">
      <style>{CSS}</style>

      <header className="invs-head">
        <span className="invs-kicker">Vendor Workspace</span>
        <h1 className="invs-title">Browse Inventory</h1>
        <p className="invs-sub">Filter your rental catalogue by category, price, location, and logistics.</p>
      </header>

      <form className="invs-filters" onSubmit={(e) => { e.preventDefault(); run(filters); }}>
        <input placeholder="Search name or description" value={filters.search} onChange={(e) => set('search', e.target.value)} />
        <input placeholder="Category" value={filters.category} onChange={(e) => set('category', e.target.value)} />
        <input placeholder="Min price" type="number" value={filters.minPrice} onChange={(e) => set('minPrice', e.target.value)} />
        <input placeholder="Max price" type="number" value={filters.maxPrice} onChange={(e) => set('maxPrice', e.target.value)} />
        <select value={filters.priceUnit} onChange={(e) => set('priceUnit', e.target.value)}>
          <option value="">Any unit</option>
          <option value="per_day">per_day</option>
          <option value="per_event">per_event</option>
          <option value="per_unit">per_unit</option>
          <option value="per_hour">per_hour</option>
        </select>
        <input placeholder="Warehouse / location" value={filters.warehouseLocation} onChange={(e) => set('warehouseLocation', e.target.value)} />
        <input placeholder="Min quantity" type="number" value={filters.minQuantity} onChange={(e) => set('minQuantity', e.target.value)} />
        <select value={filters.laborRequired} onChange={(e) => set('laborRequired', e.target.value)}>
          <option value="">Labor: any</option>
          <option value="true">Labor required</option>
          <option value="false">No labor</option>
        </select>
        <select value={filters.contractEligible} onChange={(e) => set('contractEligible', e.target.value)}>
          <option value="">Contract: any</option>
          <option value="true">Contract eligible</option>
          <option value="false">Not contract</option>
        </select>
        <select value={filters.status} onChange={(e) => set('status', e.target.value)}>
          <option value="">Any status</option>
          <option value="active">active</option>
          <option value="unavailable">unavailable</option>
          <option value="archived">archived</option>
        </select>
        <div className="invs-filter-actions">
          <button type="submit" className="invs-btn">Apply filters</button>
          <button type="button" className="invs-btn ghost" onClick={() => { setFilters(EMPTY_FILTERS); run(EMPTY_FILTERS); }}>Reset</button>
        </div>
      </form>

      {error && <div className="invs-error">{error}</div>}

      <div className="invs-count">{loading ? 'Searching.' : `${items.length} item${items.length === 1 ? '' : 's'}`}</div>

      <div className="invs-grid">
        {items.map((it) => (
          <article key={it.id} className="invs-card">
            <div className="invs-thumb" aria-hidden="true">{(it.name || 'I').slice(0, 1).toUpperCase()}</div>
            <h3>{it.name || 'Untitled'}</h3>
            <p className="invs-cat">{it.category || 'Uncategorized'}</p>
            <p className="invs-price">{money(it.price)} <em>{it.price_unit || ''}</em></p>
            <div className="invs-meta">
              <span>Qty {it.quantity ?? '-'}</span>
              {it.warehouse_location && <span>{it.warehouse_location}</span>}
              {it.lead_time && <span>Lead {it.lead_time}</span>}
              {it.labor_required && <span>Labor</span>}
              {it.contract_pricing_eligible && <span className="invs-pill">Contract</span>}
            </div>
          </article>
        ))}
      </div>

      {!loading && items.length === 0 && (
        <div className="invs-empty">No items match these filters.</div>
      )}
    </div>
  );
}

const CSS = `
.invs { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.invs *,.invs *::before,.invs *::after { box-sizing:border-box; }
.invs h1,.invs h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.invs-head { margin-bottom:18px; }
.invs-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.invs-title { font-size:28px; color:var(--e); line-height:1.1; }
.invs-sub { font-size:13px; color:var(--mut); margin:4px 0 0; }
.invs-filters { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; background:#fff; border:1px solid var(--ln); border-radius:14px; padding:16px; margin-bottom:16px; }
.invs-filters input,.invs-filters select { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.invs-filter-actions { grid-column:1 / -1; display:flex; gap:10px; }
.invs-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:8px 18px; cursor:pointer; }
.invs-btn:hover { background:var(--e2); }
.invs-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.invs-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.invs-count { font-size:12px; color:var(--mut); margin-bottom:10px; }
.invs-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
.invs-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:16px; }
.invs-thumb { width:100%; height:96px; border-radius:11px; background:linear-gradient(135deg,var(--g),#b58e44); color:var(--e); display:flex; align-items:center; justify-content:center; font-family:'Cormorant Garamond',serif; font-weight:700; font-size:38px; margin-bottom:10px; }
.invs-card h3 { font-size:18px; color:var(--e); }
.invs-cat { font-size:11.5px; color:var(--g); font-weight:600; text-transform:capitalize; margin:2px 0 6px; }
.invs-price { font-size:15px; color:var(--ink); margin:0 0 8px; font-weight:600; }
.invs-price em { color:var(--mut); font-style:normal; font-size:11.5px; font-weight:400; }
.invs-meta { display:flex; flex-wrap:wrap; gap:6px 12px; font-size:11.5px; color:var(--mut); }
.invs-pill { background:rgba(201,163,91,.18); color:var(--e); padding:1px 8px; border-radius:999px; font-weight:600; }
.invs-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); margin-top:14px; }
@media (max-width:980px){ .invs-filters { grid-template-columns:repeat(2,1fr); } .invs-grid { grid-template-columns:repeat(2,1fr); } }
@media (max-width:620px){ .invs-filters { grid-template-columns:1fr; } .invs-grid { grid-template-columns:1fr; } }
`;
