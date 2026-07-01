import React, { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';

// Phase 7 - Event Templates + history (blueprint 28). Browse and create reusable
// event templates and "duplicate a past event" from event history memory.
// Self-contained styles in the Divini Partners palette.

type Template = {
  id: string;
  name: string;
  event_type?: string | null;
  description?: string | null;
  default_guest_count?: number | null;
  categories?: string[] | null;
  default_budget?: number | string | null;
  is_global?: boolean | null;
};

type History = {
  id: string;
  name?: string | null;
  event_type?: string | null;
  guest_count?: number | null;
  total_spend?: number | string | null;
  categories?: string[] | null;
  completed_at?: string | null;
};

function money(n?: number | string | null) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return null;
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const EMPTY = { name: '', event_type: '', description: '', default_guest_count: undefined as number | undefined, categories: '' as string, default_budget: undefined as number | undefined };

export default function EventTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<History[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [t, hh] = await Promise.all([
        apiGet<{ templates: Template[] }>('/templates'),
        apiGet<{ history: History[] }>('/templates/history'),
      ]);
      setTemplates(t.templates || []);
      setHistory(hh.history || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function save() {
    if (!draft.name.trim()) {
      setError('Template name is required.');
      return;
    }
    setSaving(true);
    try {
      await apiSend('POST', '/templates', {
        name: draft.name,
        event_type: draft.event_type || undefined,
        description: draft.description || undefined,
        default_guest_count: draft.default_guest_count,
        default_budget: draft.default_budget,
        categories: draft.categories ? draft.categories.split(',').map((c) => c.trim()).filter(Boolean) : undefined,
      });
      setCreating(false);
      setDraft({ ...EMPTY });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this template?')) return;
    try {
      await apiSend('DELETE', `/templates/${id}`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function duplicate(historyId: string) {
    try {
      await apiSend('POST', `/templates/history/${historyId}/duplicate`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="tpl">
      <style>{CSS}</style>

      <header className="tpl-head">
        <div>
          <span className="tpl-kicker">Reusable Planning</span>
          <h1 className="tpl-title">Event Templates</h1>
          <p className="tpl-sub">Save reusable event blueprints and duplicate past events to plan the next one faster.</p>
        </div>
        <button type="button" className="tpl-btn" onClick={() => { setCreating(true); setDraft({ ...EMPTY }); }}>New template</button>
      </header>

      {error && <div className="tpl-error">{error}</div>}

      {creating && (
        <section className="tpl-form">
          <h2>New template</h2>
          <div className="tpl-grid">
            <label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>Event type<input value={draft.event_type} onChange={(e) => setDraft({ ...draft, event_type: e.target.value })} placeholder="wedding, gala..." /></label>
            <label>Default guests<input type="number" value={draft.default_guest_count ?? ''} onChange={(e) => setDraft({ ...draft, default_guest_count: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
            <label>Default budget ($)<input type="number" value={draft.default_budget ?? ''} onChange={(e) => setDraft({ ...draft, default_budget: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
            <label className="tpl-full">Categories (comma separated)<input value={draft.categories} onChange={(e) => setDraft({ ...draft, categories: e.target.value })} placeholder="venue, catering, florals, music" /></label>
            <label className="tpl-full">Description<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          </div>
          <div className="tpl-form-actions">
            <button type="button" className="tpl-btn ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button type="button" className="tpl-btn" disabled={saving} onClick={save}>{saving ? 'Saving.' : 'Save template'}</button>
          </div>
        </section>
      )}

      <h2 className="tpl-section">Templates</h2>
      {loading ? (
        <div className="tpl-empty">Loading.</div>
      ) : templates.length === 0 ? (
        <div className="tpl-empty">No templates yet. Create one or duplicate a past event below.</div>
      ) : (
        <div className="tpl-list">
          {templates.map((t) => (
            <article key={t.id} className="tpl-card">
              <div className="tpl-card-top">
                <h3>{t.name}</h3>
                {t.is_global ? <span className="tpl-tag global">Starter</span> : null}
              </div>
              {t.event_type && <p className="tpl-type">{t.event_type}</p>}
              {t.description && <p className="tpl-desc">{t.description}</p>}
              <p className="tpl-meta">
                {t.default_guest_count ? `${t.default_guest_count} guests` : ''}
                {t.default_guest_count && money(t.default_budget) ? ' · ' : ''}
                {money(t.default_budget) ? `${money(t.default_budget)} budget` : ''}
              </p>
              {t.categories && t.categories.length > 0 && (
                <div className="tpl-cats">{t.categories.map((c) => <span key={c} className="tpl-chip">{c}</span>)}</div>
              )}
              {!t.is_global && (
                <div className="tpl-actions">
                  <button type="button" className="tpl-btn danger sm" onClick={() => remove(t.id)}>Delete</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <h2 className="tpl-section">Event history</h2>
      {loading ? (
        <div className="tpl-empty">Loading.</div>
      ) : history.length === 0 ? (
        <div className="tpl-empty">No completed events recorded yet. Finished events appear here so you can duplicate them.</div>
      ) : (
        <div className="tpl-hist">
          {history.map((h) => (
            <article key={h.id} className="tpl-hist-card">
              <div className="tpl-hist-info">
                <h3>{h.name ?? 'Past event'}</h3>
                <p className="tpl-meta">
                  {h.event_type ? `${h.event_type} · ` : ''}
                  {h.guest_count ? `${h.guest_count} guests` : ''}
                  {money(h.total_spend) ? ` · ${money(h.total_spend)}` : ''}
                </p>
              </div>
              <button type="button" className="tpl-btn ghost sm" onClick={() => duplicate(h.id)}>Duplicate as template</button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

const CSS = `
.tpl { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.tpl *,.tpl *::before,.tpl *::after { box-sizing:border-box; }
.tpl h1,.tpl h2,.tpl h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.tpl-head { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; margin-bottom:20px; flex-wrap:wrap; }
.tpl-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.tpl-title { font-size:28px; color:var(--e); line-height:1.1; }
.tpl-sub { font-size:13px; color:var(--mut); margin:4px 0 0; }
.tpl-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.tpl-form { background:#fff; border:1px solid var(--ln); border-radius:16px; padding:20px; margin-bottom:22px; }
.tpl-form h2 { font-size:21px; color:var(--e); margin-bottom:14px; }
.tpl-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.tpl-grid label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.tpl-grid .tpl-full { grid-column:1 / -1; }
.tpl-grid input,.tpl-grid textarea { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.tpl-grid textarea { min-height:60px; resize:vertical; }
.tpl-form-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:14px; }
.tpl-section { font-size:20px; color:var(--e); margin:8px 0 12px; }
.tpl-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 18px; cursor:pointer; }
.tpl-btn:hover { background:var(--e2); }
.tpl-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.tpl-btn.danger { background:transparent; color:#9a3a28; border:1px solid #e7b7ab; }
.tpl-btn.sm { padding:6px 13px; font-size:11.5px; }
.tpl-btn:disabled { opacity:.55; cursor:default; }
.tpl-empty { padding:36px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); margin-bottom:24px; }
.tpl-list { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:28px; }
.tpl-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:6px; }
.tpl-card-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.tpl-card h3 { font-size:18px; color:var(--e); }
.tpl-tag.global { font-size:10px; letter-spacing:.5px; text-transform:uppercase; font-weight:600; padding:2px 8px; border-radius:999px; background:rgba(201,163,91,.2); color:#7a5e22; }
.tpl-type { font-size:11.5px; color:var(--g); font-weight:600; text-transform:capitalize; margin:0; }
.tpl-desc { font-size:12.5px; color:var(--mut); margin:0; line-height:1.5; }
.tpl-meta { font-size:11.5px; color:var(--mut); margin:0; }
.tpl-cats { display:flex; flex-wrap:wrap; gap:5px; margin-top:4px; }
.tpl-chip { font-size:10.5px; color:var(--e); background:rgba(18,60,46,.06); border:1px solid var(--ln); border-radius:999px; padding:2px 9px; text-transform:capitalize; }
.tpl-actions { margin-top:auto; padding-top:6px; }
.tpl-hist { display:flex; flex-direction:column; gap:10px; }
.tpl-hist-card { background:#fff; border:1px solid var(--ln); border-radius:12px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap; }
.tpl-hist-card h3 { font-size:17px; color:var(--e); }
@media (max-width:980px){ .tpl-list { grid-template-columns:repeat(2,1fr); } .tpl-grid { grid-template-columns:1fr; } }
@media (max-width:620px){ .tpl-list { grid-template-columns:1fr; } }
`;
