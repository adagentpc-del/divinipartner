import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';
import { isPlanLimitError, UpgradePrompt, type PlanLimitError } from '../lib/entitlements';

/**
 * Supplier warehouses. Free/Plus are capped at 1 warehouse; Pro unlocks
 * "Multi warehouse" (server/src/lib/planCatalog.ts). Server-enforced via
 * checkLimit -- this page only renders the block, never enforces anything.
 */

type Warehouse = {
  id: string;
  name: string;
  address: string | null;
  created_at: string;
};

const EMPTY = { name: '', address: '' };

export default function Warehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [limitError, setLimitError] = useState<PlanLimitError | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = await apiGet<{ warehouses: Warehouse[] }>('/warehouses');
      setWarehouses(r.warehouses);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setError(null);
    setLimitError(null);
    try {
      await apiSend('POST', '/warehouses', { name: form.name.trim(), address: form.address.trim() || undefined });
      setForm(EMPTY);
      setAdding(false);
      await load();
    } catch (e) {
      if (isPlanLimitError(e)) setLimitError(e.body);
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Remove this warehouse? Inventory items linked to it will be unassigned, not deleted.')) return;
    try {
      await apiSend('DELETE', `/warehouses/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="wh">
      <style>{CSS}</style>

      <header className="wh-head">
        <div>
          <h1>Warehouses</h1>
          <p className="wh-sub">
            Where your rental inventory physically lives. Free and Plus include 1 warehouse;
            Pro unlocks unlimited warehouses.
          </p>
        </div>
        <button className="wh-btn" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Cancel' : 'Add warehouse'}
        </button>
      </header>

      {loading && <p className="wh-muted">Loading.</p>}
      {error && <p className="wh-error">{error}</p>}
      {limitError && <UpgradePrompt error={limitError} onDismiss={() => setLimitError(null)} />}

      {adding && (
        <form className="wh-card wh-form" onSubmit={create}>
          <input
            placeholder="Warehouse name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            placeholder="Address (optional)"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <button type="submit" className="wh-btn" disabled={busy}>
            {busy ? 'Saving...' : 'Save warehouse'}
          </button>
        </form>
      )}

      {!loading && warehouses.length === 0 && !adding && (
        <section className="wh-card wh-empty">
          <h2>No warehouses yet</h2>
          <p className="wh-muted">Add your first warehouse to start organizing inventory by location.</p>
        </section>
      )}

      <div className="wh-list">
        {warehouses.map((w) => (
          <div className="wh-card wh-item" key={w.id}>
            <div>
              <div className="wh-item-name">{w.name}</div>
              {w.address && <div className="wh-item-address">{w.address}</div>}
            </div>
            <button className="wh-remove" onClick={() => remove(w.id)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.wh { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#6b6459; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:820px;
  margin:0 auto; padding:24px 20px 56px; }
.wh *,.wh *::before,.wh *::after { box-sizing:border-box; }
.wh-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; }
.wh-head h1 { font-size:26px; margin:0 0 6px; color:var(--e); font-weight:800; }
.wh-sub { font-size:14px; color:var(--mut); margin:0; max-width:520px; line-height:1.5; }
.wh-muted { font-size:12px; color:var(--mut); margin:10px 0 0; }
.wh-error { font-size:13px; color:#9a3a28; margin-top:10px; }

.wh-btn { background:var(--e); color:#fff; border:none; border-radius:9px; padding:9px 16px;
  font-size:13.5px; font-weight:600; cursor:pointer; white-space:nowrap; }
.wh-btn:disabled { opacity:.6; cursor:default; }

.wh-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px 20px; margin-top:16px; }
.wh-form { display:flex; flex-direction:column; gap:10px; }
.wh-form input { border:1px solid var(--ln); border-radius:8px; padding:9px 12px; font-size:14px; font-family:inherit; }
.wh-form .wh-btn { align-self:flex-start; }
.wh-empty { text-align:center; }
.wh-empty h2 { font-size:16px; color:var(--e); margin:0 0 6px; }

.wh-list { display:flex; flex-direction:column; gap:0; }
.wh-item { display:flex; justify-content:space-between; align-items:center; gap:12px; }
.wh-item-name { font-weight:700; color:var(--e); font-size:15px; }
.wh-item-address { font-size:12.5px; color:var(--mut); margin-top:2px; }
.wh-remove { background:transparent; border:1px solid var(--ln); color:#9a3a28; border-radius:8px;
  padding:6px 12px; font-size:12.5px; cursor:pointer; white-space:nowrap; }

@media(max-width:600px){ .wh { padding:18px 14px 44px; } .wh-head { flex-direction:column; } .wh-head h1 { font-size:22px; } }
`;
