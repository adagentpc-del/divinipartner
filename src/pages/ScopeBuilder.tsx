import React, { useEffect, useState } from 'react';
import { apiGet, apiSend, ApiError } from '../lib/api';
import { isFeatureLockedError, UpgradePrompt, type FeatureLockedError as FeatureLockedErrorBody } from '../lib/entitlements';

/**
 * Divini Scope Builder - structured procurement requirements
 * (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md section 9). Deterministic: forms,
 * not a chat. Every field renders from real stored template data
 * (GET /scope-builder/templates), every save appends a version
 * (GET /scope-builder/instances/:id/versions), and publish validates
 * required fields server-side before allowing it.
 */

type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'boolean' | 'select' | 'multiselect';

type TemplateField = {
  id: string;
  key: string;
  label: string;
  field_type: FieldType;
  options: string[] | null;
  required: boolean;
};

type Template = {
  id: string;
  organization_id: string | null;
  role: string;
  category: string | null;
  name: string;
};

type TemplateWithFields = Template & { fields: TemplateField[] };

type Instance = {
  id: string;
  template_id: string;
  opportunity_id: string | null;
  name: string;
  status: 'draft' | 'published';
  updated_at: string;
  published_at: string | null;
};

type InstanceDetail = {
  instance: Instance;
  template: TemplateWithFields;
  responses: Record<string, unknown>;
  version_count: number;
};

type VersionRow = { id: string; version_number: number; created_at: string };

export default function ScopeBuilder() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [buildingTemplate, setBuildingTemplate] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [t, i] = await Promise.all([
        apiGet<{ templates: Template[] }>('/scope-builder/templates'),
        apiGet<{ instances: Instance[] }>('/scope-builder/instances'),
      ]);
      setTemplates(t.templates);
      setInstances(i.instances);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  if (selectedId) {
    return <ScopeDetail id={selectedId} onBack={() => { setSelectedId(null); void load(); }} />;
  }

  return (
    <div className="scb">
      <style>{CSS}</style>
      <header className="scb-head">
        <div>
          <h1>Divini Scope Builder</h1>
          <p className="scb-sub">Complete, structured procurement requirements. Fill a scope once, reuse it in quotes and proposals.</p>
        </div>
        <div className="scb-head-actions">
          <button className="scb-btn ghost" onClick={() => setBuildingTemplate((v) => !v)}>
            {buildingTemplate ? 'Cancel' : 'Build custom template'}
          </button>
          <button className="scb-btn" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'New scope'}
          </button>
        </div>
      </header>

      {loading && <p className="scb-muted">Loading.</p>}
      {error && <p className="scb-error">{error}</p>}

      {buildingTemplate && <TemplateBuilder onDone={() => { setBuildingTemplate(false); void load(); }} />}

      {creating && (
        <NewScopeForm
          templates={templates}
          onCreated={(id) => { setCreating(false); setSelectedId(id); }}
        />
      )}

      <div className="scb-sectiontitle">Your scopes</div>
      {!loading && instances.length === 0 && (
        <div className="scb-empty">
          <p>No scopes yet. Start one from a template to capture complete requirements up front.</p>
        </div>
      )}
      <div className="scb-grid">
        {instances.map((inst) => {
          const tpl = templates.find((t) => t.id === inst.template_id);
          return (
            <div className="scb-card" key={inst.id} onClick={() => setSelectedId(inst.id)} role="button">
              <div className="scb-card-top">
                <span className="scb-card-name">{inst.name}</span>
                <span className={'scb-badge ' + inst.status}>{inst.status}</span>
              </div>
              <div className="scb-card-sub">{tpl?.name ?? 'Scope'}</div>
              <div className="scb-card-date">Updated {new Date(inst.updated_at).toLocaleDateString()}</div>
            </div>
          );
        })}
      </div>

      <div className="scb-sectiontitle">Templates</div>
      <div className="scb-grid">
        {templates.map((t) => (
          <div className="scb-card scb-tpl" key={t.id}>
            <div className="scb-card-name">{t.name}</div>
            <div className="scb-card-sub">{t.organization_id ? 'Custom' : 'Default'} &middot; {t.category ?? t.role}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewScopeForm({ templates, onCreated }: { templates: Template[]; onCreated: (id: string) => void }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!templateId && templates.length > 0) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !templateId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await apiSend<{ instance: Instance }>('POST', '/scope-builder/instances', {
        template_id: templateId,
        name: name.trim(),
      });
      onCreated(r.instance.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="scb-card scb-form" onSubmit={submit}>
      {error && <p className="scb-error">{error}</p>}
      <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <input placeholder="Name this scope (e.g. Smith Wedding, Oct 12)" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="scb-btn" disabled={busy || !templateId}>{busy ? 'Creating.' : 'Create scope'}</button>
    </form>
  );
}

function TemplateBuilder({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [fields, setFields] = useState<{ key: string; label: string; field_type: FieldType; options: string; required: boolean }[]>([
    { key: '', label: '', field_type: 'text', options: '', required: false },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<FeatureLockedErrorBody | null>(null);

  function updateField(i: number, patch: Partial<(typeof fields)[number]>) {
    setFields((f) => f.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    setLocked(null);
    try {
      await apiSend('POST', '/scope-builder/templates', {
        name: name.trim(),
        category: category.trim() || undefined,
        fields: fields
          .filter((f) => f.key.trim() && f.label.trim())
          .map((f) => ({
            key: f.key.trim(),
            label: f.label.trim(),
            field_type: f.field_type,
            required: f.required,
            options: f.options.trim() ? f.options.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
          })),
      });
      onDone();
    } catch (e) {
      if (isFeatureLockedError(e)) {
        setLocked((e as ApiError & { body: FeatureLockedErrorBody }).body);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (locked) return <UpgradePrompt error={locked} onDismiss={onDone} />;

  return (
    <form className="scb-card scb-form" onSubmit={submit}>
      {error && <p className="scb-error">{error}</p>}
      <input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} />
      <div className="scb-fieldlist">
        {fields.map((f, i) => (
          <div className="scb-fieldrow" key={i}>
            <input placeholder="Field key (e.g. guest_count)" value={f.key} onChange={(e) => updateField(i, { key: e.target.value })} />
            <input placeholder="Field label" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} />
            <select value={f.field_type} onChange={(e) => updateField(i, { field_type: e.target.value as FieldType })}>
              <option value="text">Text</option>
              <option value="textarea">Long text</option>
              <option value="number">Number</option>
              <option value="date">Date</option>
              <option value="boolean">Yes/No</option>
              <option value="select">Select</option>
              <option value="multiselect">Multi-select</option>
            </select>
            {(f.field_type === 'select' || f.field_type === 'multiselect') && (
              <input placeholder="Options, comma separated" value={f.options} onChange={(e) => updateField(i, { options: e.target.value })} />
            )}
            <label className="scb-check">
              <input type="checkbox" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
              Required
            </label>
          </div>
        ))}
      </div>
      <button type="button" className="scb-btn ghost" onClick={() => setFields((f) => [...f, { key: '', label: '', field_type: 'text', options: '', required: false }])}>
        Add field
      </button>
      <button type="submit" className="scb-btn" disabled={busy}>{busy ? 'Saving.' : 'Save template'}</button>
    </form>
  );
}

function ScopeDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const d = await apiGet<InstanceDetail>(`/scope-builder/instances/${id}`);
      setDetail(d);
      setAnswers(d.responses);
      const v = await apiGet<{ versions: VersionRow[] }>(`/scope-builder/instances/${id}/versions`);
      setVersions(v.versions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [id]);

  function setAnswer(fieldId: string, value: unknown) {
    setAnswers((a) => ({ ...a, [fieldId]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const d = await apiSend<InstanceDetail>('POST', `/scope-builder/instances/${id}/responses`, { answers });
      setDetail(d);
      setAnswers(d.responses);
      const v = await apiGet<{ versions: VersionRow[] }>(`/scope-builder/instances/${id}/versions`);
      setVersions(v.versions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(null);
    try {
      await save();
      const r = await apiSend<{ instance: Instance }>('POST', `/scope-builder/instances/${id}/publish`);
      setDetail((d) => (d ? { ...d, instance: r.instance } : d));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="scb"><style>{CSS}</style><p className="scb-muted">Loading.</p></div>;
  if (!detail) return <div className="scb"><style>{CSS}</style><p className="scb-error">{error ?? 'Scope not found.'}</p></div>;

  return (
    <div className="scb">
      <style>{CSS}</style>
      <button className="scb-back" onClick={onBack}>&larr; All scopes</button>
      <header className="scb-head">
        <div>
          <h1>{detail.instance.name}</h1>
          <p className="scb-sub">{detail.template.name} &middot; <span className={'scb-badge ' + detail.instance.status}>{detail.instance.status}</span> &middot; {versions.length} version{versions.length === 1 ? '' : 's'} saved</p>
        </div>
      </header>

      {error && <p className="scb-error">{error}</p>}

      <div className="scb-card scb-form">
        {detail.template.fields.map((f) => (
          <div className="scb-field" key={f.id}>
            <label>{f.label}{f.required && <span className="scb-req">*</span>}</label>
            <FieldInput field={f} value={answers[f.id]} onChange={(v) => setAnswer(f.id, v)} />
          </div>
        ))}
        <div className="scb-form-actions">
          <button className="scb-btn ghost" onClick={save} disabled={busy}>{busy ? 'Saving.' : 'Save'}</button>
          {detail.instance.status === 'draft' && (
            <button className="scb-btn" onClick={publish} disabled={busy}>{busy ? 'Publishing.' : 'Publish scope'}</button>
          )}
        </div>
      </div>

      {versions.length > 0 && (
        <>
          <div className="scb-sectiontitle">Version history</div>
          <div className="scb-versions">
            {versions.map((v) => (
              <div className="scb-version-row" key={v.id}>
                <span>Version {v.version_number}</span>
                <span className="scb-version-date">{new Date(v.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FieldInput({ field, value, onChange }: { field: TemplateField; value: unknown; onChange: (v: unknown) => void }) {
  switch (field.field_type) {
    case 'textarea':
      return <textarea rows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input type="number" value={value == null ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'date':
      return <input type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'boolean':
      return (
        <label className="scb-check">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          Yes
        </label>
      );
    case 'select':
      return (
        <select value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select.</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    case 'multiselect': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="scb-multiselect">
          {(field.options ?? []).map((o) => (
            <label className="scb-check" key={o}>
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => {
                  const next = e.target.checked ? [...selected, o] : selected.filter((x) => x !== o);
                  onChange(next);
                }}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }
    case 'text':
    default:
      return <input type="text" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

const CSS = `
.scb { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --ink:#2c2a26; --mut:#6b6459; --ln:#e7e1d6;
  --bg:#fbf9f4; font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:920px;
  margin:0 auto; padding:24px 20px 56px; }
.scb *,.scb *::before,.scb *::after { box-sizing:border-box; }
.scb-back { background:none; border:none; color:var(--e2); font-size:13px; font-weight:600; cursor:pointer; padding:0 0 12px; }
.scb-head { display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap; }
.scb-head h1 { font-size:24px; margin:0 0 6px; color:var(--e); font-weight:800; }
.scb-sub { font-size:14px; color:var(--mut); margin:0; max-width:560px; line-height:1.5; }
.scb-head-actions { display:flex; gap:8px; flex-wrap:wrap; }
.scb-muted { font-size:12px; color:var(--mut); margin:10px 0 0; }
.scb-error { font-size:13px; color:#9a3a28; margin:8px 0; }
.scb-sectiontitle { font-size:13px; font-weight:700; color:var(--e); text-transform:uppercase; letter-spacing:.4px; margin:24px 0 10px; }

.scb-btn { background:var(--e); color:#fff; border:none; border-radius:9px; padding:9px 16px;
  font-size:13.5px; font-weight:600; cursor:pointer; white-space:nowrap; }
.scb-btn.ghost { background:#fff; color:var(--e); border:1px solid var(--ln); }
.scb-btn:disabled { opacity:.6; cursor:default; }

.scb-card { background:#fff; border:1px solid var(--ln); border-radius:12px; padding:14px 16px; cursor:default; }
.scb-form { display:flex; flex-direction:column; gap:10px; margin-top:16px; }
.scb-form input, .scb-form select, .scb-form textarea { border:1px solid var(--ln); border-radius:8px; padding:8px 11px; font-size:13.5px; font-family:inherit; width:100%; }
.scb-form-actions { display:flex; gap:8px; margin-top:6px; }

.scb-empty { border:1px dashed var(--ln); border-radius:12px; padding:18px; color:var(--mut); font-size:13.5px; margin-top:12px; }

.scb-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px; margin-top:10px; }
.scb-card-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.scb-card-name { font-weight:700; font-size:13.5px; color:var(--e); }
.scb-card-sub { font-size:11.5px; color:var(--mut); margin-top:3px; }
.scb-card-date { font-size:10.5px; color:var(--mut); margin-top:6px; }
.scb-tpl { cursor:default; }
.scb-badge { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.3px; padding:2px 7px; border-radius:999px; background:var(--bg); color:var(--mut); border:1px solid var(--ln); }
.scb-badge.published { background:#eaf3ee; color:#1E5D4A; border-color:#c7e0d1; }

.scb-field { display:flex; flex-direction:column; gap:5px; }
.scb-field label { font-size:12px; font-weight:700; color:var(--ink); }
.scb-req { color:#9a3a28; margin-left:3px; }
.scb-check { display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:400; color:var(--ink); }
.scb-multiselect { display:flex; flex-direction:column; gap:4px; }

.scb-fieldlist { display:flex; flex-direction:column; gap:8px; }
.scb-fieldrow { display:grid; grid-template-columns:1fr 1fr 120px; gap:6px; align-items:center; border:1px dashed var(--ln); border-radius:8px; padding:8px; }
.scb-fieldrow input, .scb-fieldrow select { margin:0; }

.scb-versions { display:flex; flex-direction:column; gap:4px; }
.scb-version-row { display:flex; justify-content:space-between; font-size:12px; color:var(--mut); border-bottom:1px dashed var(--ln); padding:5px 0; }

@media(max-width:600px){ .scb { padding:18px 14px 44px; } .scb-head h1 { font-size:20px; } .scb-fieldrow { grid-template-columns:1fr; } }
`;
