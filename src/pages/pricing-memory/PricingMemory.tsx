import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';

// Phase 4 - manage the vendor pricing brain (blueprint 18). Each section maps to
// a jsonb field on vendor_pricing_memory. To stay flexible across the wide field
// set, structured fields are edited as JSON with inline validation, while the
// most-used scalars (labor rate, order minimum, rush multipliers) get friendly
// inputs.

type PricingMemory = {
  standard_rates?: Record<string, unknown>;
  product_prices?: Record<string, unknown>;
  rental_rates?: Record<string, unknown>;
  labor_rates?: Record<string, unknown>;
  minimums?: Record<string, unknown>;
  travel_fees?: Record<string, unknown>;
  discount_rules?: unknown[];
  package_templates?: unknown[];
  rush_multipliers?: Record<string, unknown>;
  seasonal_pricing?: unknown[];
  contract_pricing?: Record<string, unknown>;
  past_quotes?: unknown[];
  notes?: string;
};

const JSON_SECTIONS: { key: keyof PricingMemory; label: string; hint: string }[] = [
  { key: 'standard_rates', label: 'Standard service rates', hint: '{ "service_key": { "rate": 0, "unit": "per_event" } }' },
  { key: 'product_prices', label: 'Product prices', hint: '{ "product_key": 0 }' },
  { key: 'rental_rates', label: 'Rental rates', hint: '{ "item_key": { "rate": 0, "unit": "per_day" } }' },
  { key: 'minimums', label: 'Minimums', hint: '{ "order_minimum": 0, "labor_minimum_hours": 0 }' },
  { key: 'travel_fees', label: 'Travel fees', hint: '{ "base": 0, "per_mile": 0, "free_radius_miles": 0 }' },
  { key: 'discount_rules', label: 'Discount rules', hint: '[ { "name": "Volume", "threshold": 5000, "pct": 0.1 } ]' },
  { key: 'package_templates', label: 'Package templates', hint: '[ { "name": "Starter", "items": [], "price": 0 } ]' },
  { key: 'seasonal_pricing', label: 'Seasonal pricing', hint: '[ { "name": "Peak", "start_md": "06-01", "end_md": "08-31", "multiplier": 1.2 } ]' },
  { key: 'contract_pricing', label: 'Contract pricing', hint: '{ "partner_org_id": 0.1 }' },
];

function pretty(v: unknown): string {
  if (v == null) return '';
  try { return JSON.stringify(v, null, 2); } catch { return ''; }
}

export default function PricingMemory() {
  const [memory, setMemory] = useState<PricingMemory>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [laborDefault, setLaborDefault] = useState('');
  const [rushStd, setRushStd] = useState('');
  const [rushRush, setRushRush] = useState('');
  const [rushSameDay, setRushSameDay] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await apiGet<{ pricing_memory: PricingMemory }>('/autoquote/pricing-memory');
      const m = res.pricing_memory || {};
      setMemory(m);
      const d: Record<string, string> = {};
      for (const s of JSON_SECTIONS) d[s.key as string] = pretty(m[s.key]);
      setDrafts(d);
      const lr = (m.labor_rates || {}) as Record<string, unknown>;
      setLaborDefault(String(lr.default ?? lr.standard ?? ''));
      const rm = (m.rush_multipliers || {}) as Record<string, unknown>;
      setRushStd(String(rm.standard ?? '1'));
      setRushRush(String(rm.rush ?? '1.25'));
      setRushSameDay(String(rm.same_day ?? '1.5'));
      setNotes(m.notes || '');
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const body: PricingMemory = {};
      for (const s of JSON_SECTIONS) {
        const raw = drafts[s.key as string]?.trim();
        if (raw) {
          try {
            (body as Record<string, unknown>)[s.key as string] = JSON.parse(raw);
          } catch {
            throw new Error(`Invalid JSON in "${s.label}"`);
          }
        }
      }
      body.labor_rates = { default: Number(laborDefault) || 0 };
      body.rush_multipliers = {
        standard: Number(rushStd) || 1,
        rush: Number(rushRush) || 1,
        same_day: Number(rushSameDay) || 1,
      };
      body.notes = notes;
      const res = await apiSend<{ pricing_memory: PricingMemory }>('PUT', '/autoquote/pricing-memory', body);
      setMemory(res.pricing_memory);
      setError(null);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pm">
      <style>{CSS}</style>

      <header className="pm-head">
        <span className="pm-kicker">Vendor Workspace</span>
        <h1 className="pm-title">Pricing Memory</h1>
        <p className="pm-sub">Your private pricing brain. The auto-quote engine uses this to draft accurate quotes. Nothing here is shared with clients.</p>
      </header>

      {error && <div className="pm-error">{error}</div>}
      {saved && <div className="pm-ok">Pricing memory saved.</div>}

      {loading ? (
        <div className="pm-empty">Loading pricing memory.</div>
      ) : (
        <>
          <section className="pm-section pm-quick">
            <h2>Quick settings</h2>
            <div className="pm-quickgrid">
              <label>Default labor rate ($/hr)<input type="number" value={laborDefault} onChange={(e) => setLaborDefault(e.target.value)} /></label>
              <label>Standard multiplier<input type="number" step="0.01" value={rushStd} onChange={(e) => setRushStd(e.target.value)} /></label>
              <label>Rush multiplier<input type="number" step="0.01" value={rushRush} onChange={(e) => setRushRush(e.target.value)} /></label>
              <label>Same-day multiplier<input type="number" step="0.01" value={rushSameDay} onChange={(e) => setRushSameDay(e.target.value)} /></label>
            </div>
          </section>

          {JSON_SECTIONS.map((s) => (
            <section key={s.key as string} className="pm-section">
              <h2>{s.label}</h2>
              <p className="pm-hint">Format: <code>{s.hint}</code></p>
              <textarea
                value={drafts[s.key as string] || ''}
                placeholder={s.hint}
                onChange={(e) => setDrafts((d) => ({ ...d, [s.key as string]: e.target.value }))}
              />
            </section>
          ))}

          <section className="pm-section">
            <h2>Notes</h2>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Private notes about your pricing approach." />
          </section>

          <section className="pm-section pm-readonly">
            <h2>Past quotes and outcomes</h2>
            {Array.isArray(memory.past_quotes) && memory.past_quotes.length > 0 ? (
              <pre>{pretty(memory.past_quotes)}</pre>
            ) : (
              <p className="pm-muted">No past quotes recorded yet. Submitted auto-quotes will appear here.</p>
            )}
          </section>

          <div className="pm-actions">
            <button type="button" className="pm-btn" disabled={saving} onClick={save}>{saving ? 'Saving.' : 'Save pricing memory'}</button>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.pm { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.pm *,.pm *::before,.pm *::after { box-sizing:border-box; }
.pm h1,.pm h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.pm-head { margin-bottom:18px; }
.pm-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.pm-title { font-size:28px; color:var(--e); line-height:1.1; }
.pm-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:640px; }
.pm-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.pm-ok { background:rgba(30,93,74,.1); border:1px solid rgba(30,93,74,.3); color:var(--e2); padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.pm-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.pm-section { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; margin-bottom:14px; }
.pm-section h2 { font-size:20px; color:var(--e); margin-bottom:6px; }
.pm-hint { font-size:11.5px; color:var(--mut); margin:0 0 8px; }
.pm-hint code { background:var(--iv); padding:1px 6px; border-radius:6px; font-size:11px; }
.pm-section textarea { width:100%; min-height:90px; font-family:ui-monospace,Menlo,monospace; font-size:12.5px; color:var(--ink); padding:10px 12px; border:1px solid var(--ln); border-radius:9px; background:var(--iv); resize:vertical; }
.pm-quickgrid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
.pm-quickgrid label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.pm-quickgrid input { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.pm-readonly pre { background:var(--iv); border-radius:9px; padding:12px; font-size:11.5px; overflow:auto; max-height:240px; margin:0; }
.pm-muted { color:var(--mut); font-size:12.5px; margin:0; }
.pm-actions { display:flex; justify-content:flex-end; margin-top:6px; }
.pm-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:13px; font-weight:600; padding:10px 22px; cursor:pointer; }
.pm-btn:hover { background:var(--e2); }
.pm-btn:disabled { opacity:.6; cursor:default; }
@media (max-width:760px){ .pm-quickgrid { grid-template-columns:1fr 1fr; } }
`;
