import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

// Phase 2 - Vendor Quote Requirement Builder (VENUE-INTELLIGENCE-ADDENDUM.md data
// model 5). The vendor designs the custom intake form they need filled in before
// quoting a service category: add/remove/reorder fields, pick a type, mark
// required, add dropdown options, attach conditional show-if logic, and save the
// whole set as a reusable template. The ordered field array is persisted to
// vendor_quote_requirements.schema, which Phase 3 renders and prefills against.
//
// Self-contained: no route is registered here (the lead wires App.tsx). Pass the
// vendor id via ?vendor=<uuid> (falls back to a manual input).

type FieldType = 'text' | 'number' | 'dropdown' | 'checkbox' | 'date' | 'formula';
type CondOp = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'truthy';

type Conditional = { field: string; op: CondOp; value?: string } | null;

type Field = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
  conditional: Conditional;
  formula: string | null;
};

type RequirementRow = {
  id: string;
  vendor_id: string | null;
  service_category: string | null;
  schema: Field[] | null;
  is_template: boolean | null;
  template_name: string | null;
};

const FIELD_TYPES: FieldType[] = ['text', 'number', 'dropdown', 'checkbox', 'date', 'formula'];
const COND_OPS: CondOp[] = ['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'truthy'];

function blankField(i: number): Field {
  return {
    key: `field_${i + 1}`,
    label: '',
    type: 'text',
    required: false,
    options: [],
    conditional: null,
    formula: null,
  };
}

function readVendorParam(): string {
  try {
    const p = new URLSearchParams(window.location.search);
    return p.get('vendor') || '';
  } catch {
    return '';
  }
}

export default function VendorRequirementBuilder() {
  const [vendorId, setVendorId] = useState(readVendorParam());
  const [rows, setRows] = useState<RequirementRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [category, setCategory] = useState('');
  const [fields, setFields] = useState<Field[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [isTemplate, setIsTemplate] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load(vid: string) {
    if (!vid) return;
    setLoading(true);
    try {
      const res = await apiGet<{ requirements: RequirementRow[] }>(`/vendor-requirements/vendor/${vid}`);
      setRows(res.requirements || []);
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
    setFields([blankField(0)]);
    setTemplateName('');
    setIsTemplate(false);
    setSaved(false);
  }

  function editRow(r: RequirementRow) {
    setActiveId(r.id);
    setCategory(r.service_category || '');
    setFields(Array.isArray(r.schema) ? r.schema.map((f) => ({
      key: f.key,
      label: f.label || '',
      type: (f.type as FieldType) || 'text',
      required: !!f.required,
      options: Array.isArray(f.options) ? f.options : [],
      conditional: f.conditional ?? null,
      formula: f.formula ?? null,
    })) : []);
    setTemplateName(r.template_name || '');
    setIsTemplate(!!r.is_template);
    setSaved(false);
  }

  function updateField(i: number, patch: Partial<Field>) {
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function addField() {
    setFields((fs) => [...fs, blankField(fs.length)]);
  }

  function removeField(i: number) {
    setFields((fs) => fs.filter((_, idx) => idx !== i));
  }

  function move(i: number, dir: -1 | 1) {
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const copy = fs.slice();
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
      return copy;
    });
  }

  function buildSchema(): Field[] {
    // Persist the ordered array as-is; the server validates and normalizes it.
    return fields.map((f) => ({
      key: f.key.trim(),
      label: f.label.trim() || f.key.trim(),
      type: f.type,
      required: f.required,
      options: f.type === 'dropdown' ? f.options.filter((o) => o.trim()) : [],
      conditional: f.conditional && f.conditional.field ? f.conditional : null,
      formula: f.type === 'formula' ? (f.formula || '') : null,
    }));
  }

  async function save() {
    if (!vendorId) { setError('Vendor id required.'); return; }
    setSaving(true);
    setSaved(false);
    try {
      const body = {
        service_category: category || null,
        schema: buildSchema(),
        is_template: isTemplate,
        template_name: isTemplate ? (templateName || null) : null,
      };
      let row: RequirementRow;
      if (activeId) {
        const res = await apiSend<{ requirement: RequirementRow }>('PATCH', `/vendor-requirements/${activeId}`, body);
        row = res.requirement;
      } else {
        const res = await apiSend<{ requirement: RequirementRow }>('POST', `/vendor-requirements/vendor/${vendorId}`, body);
        row = res.requirement;
        setActiveId(row.id);
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

  async function saveAsTemplate() {
    if (!activeId) { setError('Save the requirement set first, then save it as a template.'); return; }
    const name = templateName.trim() || category.trim() || 'Template';
    setSaving(true);
    try {
      await apiSend('POST', `/vendor-requirements/${activeId}/template`, { template_name: name });
      setIsTemplate(true);
      setTemplateName(name);
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
      await apiSend('DELETE', `/vendor-requirements/${id}`);
      if (activeId === id) newSet();
      await load(vendorId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="vrb">
      <style>{CSS}</style>

      <header className="vrb-head">
        <span className="vrb-kicker">Vendor Workspace</span>
        <h1 className="vrb-title">Quote Requirement Builder</h1>
        <p className="vrb-sub">Design the intake form clients fill in before you quote a service. Add custom fields, conditional logic, and formulas, then reuse them as templates.</p>
      </header>

      {error && <div className="vrb-error">{error}</div>}
      {saved && <div className="vrb-ok">Saved.</div>}

      <section className="vrb-section">
        <div className="vrb-vendorrow">
          <label>Vendor id
            <input value={vendorId} placeholder="vendor uuid" onChange={(e) => setVendorId(e.target.value)} />
          </label>
          <button type="button" className="vrb-btn ghost" onClick={() => load(vendorId)} disabled={!vendorId || loading}>{loading ? 'Loading.' : 'Load'}</button>
          <button type="button" className="vrb-btn ghost" onClick={newSet}>+ New requirement set</button>
        </div>
      </section>

      {rows.length > 0 && (
        <section className="vrb-section">
          <h2>Saved requirement sets</h2>
          <div className="vrb-list">
            {rows.map((r) => (
              <div key={r.id} className={`vrb-listrow${activeId === r.id ? ' active' : ''}`}>
                <button type="button" className="vrb-link" onClick={() => editRow(r)}>
                  {r.service_category || '(no category)'}
                  {r.is_template ? <span className="vrb-tag">template{r.template_name ? `: ${r.template_name}` : ''}</span> : null}
                  <span className="vrb-count">{Array.isArray(r.schema) ? r.schema.length : 0} fields</span>
                </button>
                <button type="button" className="vrb-del" onClick={() => del(r.id)} disabled={saving}>Delete</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="vrb-section">
        <h2>{activeId ? 'Edit requirement set' : 'New requirement set'}</h2>
        <div className="vrb-metarow">
          <label>Service category
            <input value={category} placeholder="e.g. fabrication, AV, signage" onChange={(e) => setCategory(e.target.value)} />
          </label>
          <label className="vrb-check">
            <input type="checkbox" checked={isTemplate} onChange={(e) => setIsTemplate(e.target.checked)} />
            Save as template
          </label>
          {isTemplate && (
            <label>Template name
              <input value={templateName} placeholder="Template name" onChange={(e) => setTemplateName(e.target.value)} />
            </label>
          )}
        </div>

        <div className="vrb-fields">
          {fields.length === 0 && <p className="vrb-muted">No fields yet. Add one below.</p>}
          {fields.map((f, i) => (
            <div key={i} className="vrb-field">
              <div className="vrb-fieldgrid">
                <label>Key
                  <input value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} />
                </label>
                <label>Label
                  <input value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
                </label>
                <label>Type
                  <select value={f.type} onChange={(e) => updateField(i, { type: e.target.value as FieldType })}>
                    {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                <label className="vrb-check">
                  <input type="checkbox" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
                  Required
                </label>
              </div>

              {f.type === 'dropdown' && (
                <label className="vrb-wide">Options (one per line)
                  <textarea
                    value={f.options.join('\n')}
                    placeholder={'Option A\nOption B'}
                    onChange={(e) => updateField(i, { options: e.target.value.split('\n') })}
                  />
                </label>
              )}

              {f.type === 'formula' && (
                <label className="vrb-wide">Formula (reference other field keys)
                  <input
                    value={f.formula || ''}
                    placeholder="width * height"
                    onChange={(e) => updateField(i, { formula: e.target.value })}
                  />
                </label>
              )}

              <div className="vrb-cond">
                <label className="vrb-check">
                  <input
                    type="checkbox"
                    checked={!!f.conditional}
                    onChange={(e) => updateField(i, { conditional: e.target.checked ? { field: '', op: 'truthy' } : null })}
                  />
                  Show only when (conditional)
                </label>
                {f.conditional && (
                  <div className="vrb-condgrid">
                    <input
                      placeholder="depends on field key"
                      value={f.conditional.field}
                      onChange={(e) => updateField(i, { conditional: { ...f.conditional!, field: e.target.value } })}
                    />
                    <select
                      value={f.conditional.op}
                      onChange={(e) => updateField(i, { conditional: { ...f.conditional!, op: e.target.value as CondOp } })}
                    >
                      {COND_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {f.conditional.op !== 'truthy' && (
                      <input
                        placeholder="value"
                        value={f.conditional.value ?? ''}
                        onChange={(e) => updateField(i, { conditional: { ...f.conditional!, value: e.target.value } })}
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="vrb-fieldactions">
                <button type="button" className="vrb-mini" onClick={() => move(i, -1)} disabled={i === 0}>Up</button>
                <button type="button" className="vrb-mini" onClick={() => move(i, 1)} disabled={i === fields.length - 1}>Down</button>
                <button type="button" className="vrb-mini danger" onClick={() => removeField(i)}>Remove</button>
              </div>
            </div>
          ))}
        </div>

        <div className="vrb-actions">
          <button type="button" className="vrb-btn ghost" onClick={addField}>+ Add field</button>
          <div className="vrb-spacer" />
          <button type="button" className="vrb-btn ghost" onClick={saveAsTemplate} disabled={saving || !activeId}>Save as template</button>
          <button type="button" className="vrb-btn" onClick={save} disabled={saving || !vendorId}>{saving ? 'Saving.' : 'Save requirement set'}</button>
        </div>
      </section>
    </div>
  );
}

const CSS = `
.vrb { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1100px; }
.vrb *,.vrb *::before,.vrb *::after { box-sizing:border-box; }
.vrb h1,.vrb h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.vrb-head { margin-bottom:18px; }
.vrb-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.vrb-title { font-size:28px; color:var(--e); line-height:1.1; }
.vrb-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:640px; }
.vrb-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.vrb-ok { background:rgba(30,93,74,.1); border:1px solid rgba(30,93,74,.3); color:var(--e2); padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.vrb-section { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; margin-bottom:14px; }
.vrb-section h2 { font-size:20px; color:var(--e); margin-bottom:12px; }
.vrb-muted { color:var(--mut); font-size:12.5px; }
.vrb label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.vrb input,.vrb select,.vrb textarea { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; color:var(--ink); }
.vrb textarea { min-height:64px; resize:vertical; }
.vrb-vendorrow { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
.vrb-vendorrow label { flex:1; min-width:240px; }
.vrb-metarow { display:flex; gap:14px; align-items:flex-end; flex-wrap:wrap; margin-bottom:14px; }
.vrb-metarow label { min-width:200px; }
.vrb-check { flex-direction:row !important; align-items:center; gap:8px; }
.vrb-check input { width:auto; }
.vrb-list { display:flex; flex-direction:column; gap:8px; }
.vrb-listrow { display:flex; align-items:center; justify-content:space-between; border:1px solid var(--ln); border-radius:10px; padding:8px 12px; background:var(--iv); }
.vrb-listrow.active { border-color:var(--g); }
.vrb-link { background:none; border:0; font:inherit; font-size:13px; color:var(--e); cursor:pointer; display:flex; align-items:center; gap:10px; text-align:left; }
.vrb-tag { font-size:10.5px; background:var(--g); color:#fff; padding:1px 7px; border-radius:20px; }
.vrb-count { font-size:11px; color:var(--mut); }
.vrb-del { background:none; border:0; color:#9a3a28; font:inherit; font-size:12px; cursor:pointer; }
.vrb-fields { display:flex; flex-direction:column; gap:12px; }
.vrb-field { border:1px solid var(--ln); border-radius:12px; padding:14px; background:var(--iv); }
.vrb-fieldgrid { display:grid; grid-template-columns:1fr 1fr 140px 120px; gap:12px; align-items:end; }
.vrb-wide { margin-top:10px; }
.vrb-cond { margin-top:10px; }
.vrb-condgrid { display:grid; grid-template-columns:1fr 120px 1fr; gap:8px; margin-top:6px; }
.vrb-fieldactions { display:flex; gap:8px; margin-top:10px; }
.vrb-mini { background:#fff; border:1px solid var(--ln); border-radius:8px; font:inherit; font-size:12px; padding:5px 12px; cursor:pointer; }
.vrb-mini.danger { color:#9a3a28; border-color:#e7b7ab; }
.vrb-mini:disabled { opacity:.5; cursor:default; }
.vrb-actions { display:flex; gap:10px; align-items:center; margin-top:16px; }
.vrb-spacer { flex:1; }
.vrb-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:13px; font-weight:600; padding:10px 22px; cursor:pointer; }
.vrb-btn:hover { background:var(--e2); }
.vrb-btn.ghost { background:#fff; color:var(--e); border:1px solid var(--ln); }
.vrb-btn:disabled { opacity:.6; cursor:default; }
@media (max-width:760px){ .vrb-fieldgrid { grid-template-columns:1fr 1fr; } .vrb-condgrid { grid-template-columns:1fr; } }
`;
