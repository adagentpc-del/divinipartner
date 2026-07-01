import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

// Phase 2 - Vendor Pricing Rules builder (VENUE-INTELLIGENCE-ADDENDUM.md data
// model 6). The vendor defines a base price plus an ordered list of conditional
// steps: "if <field> <op> <value> then set/add an amount (optionally per unit of
// another field)". The structure is persisted to vendor_pricing_rules.rules,
// which Phase 3's pricingEngine interprets (no eval) to compute a draft price.
//
// Self-contained: no route is registered here (the lead wires App.tsx). Pass the
// vendor id via ?vendor=<uuid> (falls back to a manual input).

type Op = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'truthy';
type Action = 'set' | 'add';

type Step = {
  if: { field: string; op: Op; value?: string };
  then: { action: Action; amount: string; perUnitField: string };
};

type RuleRow = {
  id: string;
  vendor_id: string | null;
  service_category: string | null;
  rules: { base?: number; steps?: unknown[] } | null;
  base_unit: string | null;
  notes: string | null;
};

const OPS: Op[] = ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'truthy'];
const ACTIONS: Action[] = ['set', 'add'];

function blankStep(): Step {
  return { if: { field: '', op: 'truthy' }, then: { action: 'add', amount: '0', perUnitField: '' } };
}

function readVendorParam(): string {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('vendor') || '';
  } catch {
    return '';
  }
}

export default function VendorPricingRules() {
  const [vendorId, setVendorId] = useState(readVendorParam());
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [category, setCategory] = useState('');
  const [baseUnit, setBaseUnit] = useState('per_event');
  const [base, setBase] = useState('0');
  const [steps, setSteps] = useState<Step[]>([]);
  const [notes, setNotes] = useState('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load(vid: string) {
    if (!vid) return;
    setLoading(true);
    try {
      const res = await apiGet<{ pricing_rules: RuleRow[] }>(`/vendor-pricing/vendor/${vid}`);
      setRows(res.pricing_rules || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (vendorId) load(vendorId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function newSet() {
    setActiveId(null);
    setCategory('');
    setBaseUnit('per_event');
    setBase('0');
    setSteps([blankStep()]);
    setNotes('');
    setSaved(false);
  }

  function editRow(r: RuleRow) {
    setActiveId(r.id);
    setCategory(r.service_category || '');
    setBaseUnit(r.base_unit || 'per_event');
    setBase(String(r.rules?.base ?? 0));
    const rawSteps = Array.isArray(r.rules?.steps) ? (r.rules!.steps as Record<string, unknown>[]) : [];
    setSteps(rawSteps.map((s) => {
      const cond = (s.if ?? {}) as Record<string, unknown>;
      const then = (s.then ?? {}) as Record<string, unknown>;
      return {
        if: {
          field: String(cond.field ?? ''),
          op: (cond.op as Op) || 'truthy',
          value: cond.value == null ? '' : String(cond.value),
        },
        then: {
          action: (then.action as Action) || 'add',
          amount: String(then.amount ?? 0),
          perUnitField: then.perUnitField == null ? '' : String(then.perUnitField),
        },
      };
    }));
    setNotes(r.notes || '');
    setSaved(false);
  }

  function updateStep(i: number, patch: Partial<Step>) {
    setSteps((ss) => ss.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function move(i: number, dir: -1 | 1) {
    setSteps((ss) => {
      const j = i + dir;
      if (j < 0 || j >= ss.length) return ss;
      const copy = ss.slice();
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
      return copy;
    });
  }

  function buildRules() {
    return {
      base: Number(base) || 0,
      steps: steps
        .filter((s) => s.if.field.trim() || s.if.op === 'truthy')
        .map((s) => ({
          if: {
            field: s.if.field.trim(),
            op: s.if.op,
            ...(s.if.op === 'truthy' ? {} : { value: s.if.value ?? '' }),
          },
          then: {
            action: s.then.action,
            amount: Number(s.then.amount) || 0,
            ...(s.then.perUnitField.trim() ? { perUnitField: s.then.perUnitField.trim() } : {}),
          },
        })),
    };
  }

  async function save() {
    if (!vendorId) { setError('Vendor id required.'); return; }
    setSaving(true);
    setSaved(false);
    try {
      const body = {
        service_category: category || null,
        rules: buildRules(),
        base_unit: baseUnit || null,
        notes: notes || null,
      };
      if (activeId) {
        await apiSend<{ pricing_rule: RuleRow }>('PATCH', `/vendor-pricing/${activeId}`, body);
      } else {
        const res = await apiSend<{ pricing_rule: RuleRow }>('POST', `/vendor-pricing/vendor/${vendorId}`, body);
        setActiveId(res.pricing_rule.id);
      }
      setError(null);
      setSaved(true);
      await load(vendorId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function del(id: string) {
    setSaving(true);
    try {
      await apiSend('DELETE', `/vendor-pricing/${id}`);
      if (activeId === id) newSet();
      await load(vendorId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vpr">
      <style>{CSS}</style>

      <header className="vpr-head">
        <span className="vpr-kicker">Vendor Workspace</span>
        <h1 className="vpr-title">Pricing Rules</h1>
        <p className="vpr-sub">Set a base price and ordered conditional steps. The quote engine runs these top to bottom to compute a draft price. No client ever sees the rules.</p>
      </header>

      {error && <div className="vpr-error">{error}</div>}
      {saved && <div className="vpr-ok">Saved.</div>}

      <section className="vpr-section">
        <div className="vpr-vendorrow">
          <label>Vendor id
            <input value={vendorId} placeholder="vendor uuid" onChange={(e) => setVendorId(e.target.value)} />
          </label>
          <button type="button" className="vpr-btn ghost" onClick={() => load(vendorId)} disabled={!vendorId || loading}>{loading ? 'Loading.' : 'Load'}</button>
          <button type="button" className="vpr-btn ghost" onClick={newSet}>+ New rule set</button>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="vpr-section">
          <h2>Saved rule sets</h2>
          <div className="vpr-list">
            {rows.map((r) => (
              <div key={r.id} className={`vpr-listrow${activeId === r.id ? ' active' : ''}`}>
                <button type="button" className="vpr-link" onClick={() => editRow(r)}>
                  {r.service_category || '(no category)'}
                  <span className="vpr-count">base {Number(r.rules?.base ?? 0)} {r.base_unit || ''} · {Array.isArray(r.rules?.steps) ? r.rules!.steps.length : 0} steps</span>
                </button>
                <button type="button" className="vpr-del" onClick={() => del(r.id)} disabled={saving}>Delete</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="vpr-section">
        <h2>{activeId ? 'Edit rule set' : 'New rule set'}</h2>
        <div className="vpr-metarow">
          <label>Service category
            <input value={category} placeholder="e.g. fabrication, AV, signage" onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label>Base price
            <input type="number" value={base} onChange={(e) => setBase(e.target.value)} />
          </label>
          <label>Base unit
            <input value={baseUnit} placeholder="per_event" onChange={(e) => setBaseUnit(e.target.value)} />
          </label>
        </div>

        <div className="vpr-steps">
          {steps.length === 0 && <p className="vpr-muted">No steps yet. Add one below. The base price applies on its own.</p>}
          {steps.map((s, i) => (
            <div key={i} className="vpr-step">
              <div className="vpr-stepno">{i + 1}</div>
              <div className="vpr-stepbody">
                <div className="vpr-row">
                  <span className="vpr-kw">if</span>
                  <input
                    placeholder="field key"
                    value={s.if.field}
                    onChange={(e) => updateStep(i, { if: { ...s.if, field: e.target.value } })}
                  />
                  <select value={s.if.op} onChange={(e) => updateStep(i, { if: { ...s.if, op: e.target.value as Op } })}>
                    {OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  {s.if.op !== 'truthy' && (
                    <input
                      placeholder="value"
                      value={s.if.value ?? ''}
                      onChange={(e) => updateStep(i, { if: { ...s.if, value: e.target.value } })}
                    />
                  )}
                </div>
                <div className="vpr-row">
                  <span className="vpr-kw">then</span>
                  <select value={s.then.action} onChange={(e) => updateStep(i, { then: { ...s.then, action: e.target.value as Action } })}>
                    {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <input
                    type="number"
                    placeholder="amount"
                    value={s.then.amount}
                    onChange={(e) => updateStep(i, { then: { ...s.then, amount: e.target.value } })}
                  />
                  <span className="vpr-kw">per unit of</span>
                  <input
                    placeholder="field key (optional)"
                    value={s.then.perUnitField}
                    onChange={(e) => updateStep(i, { then: { ...s.then, perUnitField: e.target.value } })}
                  />
                </div>
                <div className="vpr-stepactions">
                  <button type="button" className="vpr-mini" onClick={() => move(i, -1)} disabled={i === 0}>Up</button>
                  <button type="button" className="vpr-mini" onClick={() => move(i, 1)} disabled={i === steps.length - 1}>Down</button>
                  <button type="button" className="vpr-mini danger" onClick={() => setSteps((ss) => ss.filter((_, idx) => idx !== i))}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <label className="vpr-notes">Notes
          <textarea value={notes} placeholder="Private notes about this pricing logic." onChange={(e) => setNotes(e.target.value)} />
        </label>

        <div className="vpr-actions">
          <button type="button" className="vpr-btn ghost" onClick={() => setSteps((ss) => [...ss, blankStep()])}>+ Add step</button>
          <div className="vpr-spacer" />
          <button type="button" className="vpr-btn" onClick={save} disabled={saving || !vendorId}>{saving ? 'Saving.' : 'Save rule set'}</button>
        </div>
      </section>
    </div>
  );
}

const CSS = `
.vpr { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1100px; }
.vpr *,.vpr *::before,.vpr *::after { box-sizing:border-box; }
.vpr h1,.vpr h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.vpr-head { margin-bottom:18px; }
.vpr-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.vpr-title { font-size:28px; color:var(--e); line-height:1.1; }
.vpr-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:640px; }
.vpr-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.vpr-ok { background:rgba(30,93,74,.1); border:1px solid rgba(30,93,74,.3); color:var(--e2); padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.vpr-section { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; margin-bottom:14px; }
.vpr-section h2 { font-size:20px; color:var(--e); margin-bottom:12px; }
.vpr-muted { color:var(--mut); font-size:12.5px; }
.vpr label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.vpr input,.vpr select,.vpr textarea { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; color:var(--ink); }
.vpr textarea { min-height:64px; resize:vertical; }
.vpr-vendorrow { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
.vpr-vendorrow label { flex:1; min-width:240px; }
.vpr-metarow { display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap; margin-bottom:14px; }
.vpr-metarow label { min-width:160px; }
.vpr-list { display:flex; flex-direction:column; gap:8px; }
.vpr-listrow { display:flex; align-items:center; justify-content:space-between; border:1px solid var(--ln); border-radius:10px; padding:8px 12px; background:var(--iv); }
.vpr-listrow.active { border-color:var(--g); }
.vpr-link { background:none; border:0; font:inherit; font-size:13px; color:var(--e); cursor:pointer; display:flex; align-items:center; gap:10px; text-align:left; }
.vpr-count { font-size:11px; color:var(--mut); }
.vpr-del { background:none; border:0; color:#9a3a28; font:inherit; font-size:12px; cursor:pointer; }
.vpr-steps { display:flex; flex-direction:column; gap:10px; }
.vpr-step { display:flex; gap:12px; border:1px solid var(--ln); border-radius:12px; padding:12px; background:var(--iv); }
.vpr-stepno { width:26px; height:26px; flex:0 0 auto; border-radius:50%; background:var(--e); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:600; }
.vpr-stepbody { flex:1; display:flex; flex-direction:column; gap:8px; }
.vpr-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.vpr-row input,.vpr-row select { flex:1; min-width:90px; }
.vpr-kw { font-size:12px; font-weight:700; color:var(--e2); }
.vpr-stepactions { display:flex; gap:8px; }
.vpr-mini { background:#fff; border:1px solid var(--ln); border-radius:8px; font:inherit; font-size:12px; padding:5px 12px; cursor:pointer; }
.vpr-mini.danger { color:#9a3a28; border-color:#e7b7ab; }
.vpr-mini:disabled { opacity:.5; cursor:default; }
.vpr-notes { margin-top:14px; }
.vpr-actions { display:flex; gap:10px; align-items:center; margin-top:16px; }
.vpr-spacer { flex:1; }
.vpr-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:13px; font-weight:600; padding:10px 22px; cursor:pointer; }
.vpr-btn:hover { background:var(--e2); }
.vpr-btn.ghost { background:#fff; color:var(--e); border:1px solid var(--ln); }
.vpr-btn:disabled { opacity:.6; cursor:default; }
@media (max-width:760px){ .vpr-metarow label { min-width:120px; } }
`;
