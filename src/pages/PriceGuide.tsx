import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';
import { isFeatureLockedError, UpgradePrompt, type FeatureLockedError } from '../lib/entitlements';

/**
 * Divini Price Guide (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md) - calculates
 * a profitable pricing range from a real cost and a target margin. Pure
 * arithmetic, shown with the formula that produced it -- never a "smart"
 * suggestion. Real historical context comes from Divini Profit Map (an
 * org-wide average achieved margin), never a fabricated per-item match.
 */

type Item = {
  id: string;
  name: string;
  category: string | null;
  typical_cost: string;
  target_margin_pct: string;
  floor_margin_pct: string | null;
  notes: string | null;
  target_price: number;
  floor_price: number | null;
};

type Context = { costedJobCount: number; averageMarginPct: number | null };

const fmtMoney = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${Math.round(n * 100)}%`;

const EMPTY_FORM = { name: '', category: '', typical_cost: '', target_margin_pct: '30', floor_margin_pct: '', notes: '' };

export default function PriceGuide() {
  const [items, setItems] = useState<Item[]>([]);
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockError, setLockError] = useState<FeatureLockedError | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    setLockError(null);
    try {
      const [i, c] = await Promise.all([
        apiGet<{ items: Item[] }>('/price-guide/items'),
        apiGet<{ context: Context }>('/price-guide/context'),
      ]);
      setItems(i.items);
      setContext(c.context);
    } catch (e) {
      if (isFeatureLockedError(e)) setLockError(e.body);
      else setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.typical_cost) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend('POST', '/price-guide/items', {
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        typical_cost: Number(form.typical_cost),
        target_margin_pct: Number(form.target_margin_pct) / 100,
        floor_margin_pct: form.floor_margin_pct ? Number(form.floor_margin_pct) / 100 : undefined,
        notes: form.notes.trim() || undefined,
      });
      setForm(EMPTY_FORM);
      setCreating(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await apiSend('DELETE', `/price-guide/items/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pg">
      <style>{CSS}</style>
      <header className="pg-head">
        <div>
          <h1>Divini Price Guide</h1>
          <p className="pg-sub">Enter your real cost and the margin you want. The price is the arithmetic that hits it, shown with the formula -- never a guess.</p>
        </div>
        <button className="pg-btn" onClick={() => setCreating((v) => !v)}>{creating ? 'Cancel' : 'New item'}</button>
      </header>

      {loading && <p className="pg-muted">Loading.</p>}
      {error && <p className="pg-error">{error}</p>}
      {lockError && <UpgradePrompt error={lockError} />}

      {!lockError && context && context.costedJobCount > 0 && (
        <div className="pg-context">
          Your recorded average margin across {context.costedJobCount} costed job{context.costedJobCount === 1 ? '' : 's'} in Divini Profit Map is{' '}
          <strong>{fmtPct(context.averageMarginPct ?? 0)}</strong>. Use that as real context when picking a target margin below.
        </div>
      )}

      {creating && (
        <form className="pg-card pg-form" onSubmit={create}>
          <input placeholder="Item or service name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Category (optional)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input type="number" min="0" step="0.01" placeholder="Typical cost ($)" value={form.typical_cost} onChange={(e) => setForm({ ...form, typical_cost: e.target.value })} />
          <label className="pg-label">Target margin (%)
            <input type="number" min="0" max="99" step="1" value={form.target_margin_pct} onChange={(e) => setForm({ ...form, target_margin_pct: e.target.value })} />
          </label>
          <label className="pg-label">Floor margin (%, optional)
            <input type="number" min="0" max="99" step="1" placeholder="e.g. 15" value={form.floor_margin_pct} onChange={(e) => setForm({ ...form, floor_margin_pct: e.target.value })} />
          </label>
          <input placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <button type="submit" className="pg-btn" disabled={busy}>{busy ? 'Saving.' : 'Save item'}</button>
        </form>
      )}

      <div className="pg-grid">
        {items.map((it) => (
          <div className="pg-card pg-item" key={it.id}>
            <div className="pg-item-top">
              <span className="pg-item-name">{it.name}</span>
              <button className="pg-remove" onClick={() => remove(it.id)} disabled={busy}>&times;</button>
            </div>
            {it.category && <div className="pg-item-cat">{it.category}</div>}
            <div className="pg-item-cost">Cost {fmtMoney(Number(it.typical_cost))}</div>
            <div className="pg-price-row">
              <span className="pg-price-label">Target price ({fmtPct(Number(it.target_margin_pct))} margin)</span>
              <span className="pg-price-val">{fmtMoney(it.target_price)}</span>
            </div>
            {it.floor_price != null && (
              <div className="pg-price-row floor">
                <span className="pg-price-label">Floor price ({fmtPct(Number(it.floor_margin_pct))} margin)</span>
                <span className="pg-price-val">{fmtMoney(it.floor_price)}</span>
              </div>
            )}
            <div className="pg-formula">price = cost ÷ (1 − margin)</div>
            {it.notes && <div className="pg-item-notes">{it.notes}</div>}
          </div>
        ))}
        {!loading && !lockError && items.length === 0 && (
          <div className="pg-empty">No pricing items yet. Add one to calculate a target price from a real cost.</div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.pg { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:920px;
  margin:0 auto; padding:24px 20px 56px; }
.pg *,.pg *::before,.pg *::after { box-sizing:border-box; }
.pg-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; }
.pg-head h1 { font-size:24px; margin:0 0 6px; color:var(--e); font-weight:800; }
.pg-sub { font-size:14px; color:var(--mut); margin:0; max-width:560px; line-height:1.5; }
.pg-muted { font-size:12px; color:var(--mut); margin:10px 0 0; }
.pg-error { font-size:13px; color:#9a3a28; margin:8px 0; }

.pg-context { background:#fbf7ee; border:1px solid var(--g); border-radius:12px; padding:12px 16px; margin-top:14px; font-size:13px; color:var(--ink); line-height:1.5; }
.pg-context strong { color:var(--e); }

.pg-btn { background:var(--e); color:#fff; border:none; border-radius:9px; padding:9px 16px;
  font-size:13.5px; font-weight:600; cursor:pointer; white-space:nowrap; }
.pg-btn:disabled { opacity:.6; cursor:default; }

.pg-card { background:#fff; border:1px solid var(--ln); border-radius:12px; padding:14px 16px; }
.pg-form { display:flex; flex-direction:column; gap:8px; margin-top:16px; }
.pg-form input { border:1px solid var(--ln); border-radius:8px; padding:8px 11px; font-size:13.5px; font-family:inherit; width:100%; }
.pg-label { display:flex; flex-direction:column; gap:4px; font-size:12px; font-weight:600; color:var(--mut); }

.pg-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:10px; margin-top:18px; }
.pg-empty { border:1px dashed var(--ln); border-radius:12px; padding:18px; color:var(--mut); font-size:13.5px; grid-column:1/-1; }

.pg-item-top { display:flex; justify-content:space-between; align-items:center; }
.pg-item-name { font-weight:700; font-size:14px; color:var(--e); }
.pg-remove { background:none; border:none; color:#9a3a28; font-size:18px; cursor:pointer; line-height:1; }
.pg-item-cat { font-size:11px; color:var(--mut); margin-top:2px; }
.pg-item-cost { font-size:12.5px; color:var(--mut); margin-top:8px; }

.pg-price-row { display:flex; justify-content:space-between; align-items:center; margin-top:8px; border-top:1px dashed var(--ln); padding-top:8px; }
.pg-price-row.floor { border-top:none; padding-top:2px; }
.pg-price-label { font-size:11.5px; color:var(--mut); }
.pg-price-val { font-size:16px; font-weight:800; color:var(--e); }
.pg-formula { font-size:10.5px; color:var(--mut); font-style:italic; margin-top:6px; }
.pg-item-notes { font-size:12px; color:var(--mut); margin-top:8px; }

@media(max-width:600px){ .pg { padding:18px 14px 44px; } .pg-head h1 { font-size:20px; } }
`;
