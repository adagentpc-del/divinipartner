import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

// Intelligence Moat - F2 Event Playbook Engine.
// Browse org playbooks (with template-type chips), save the current/any event as
// a reusable playbook, and clone a playbook into a brand new event (then jump
// straight into the new event workspace). Complements Event Templates.
// Self-contained styles in the Divini Partners palette.

type Playbook = {
  id: string;
  name: string;
  template_type?: string | null;
  created_from_event_id?: string | null;
  created_at?: string | null;
  payload?: {
    event_meta?: {
      type?: string | null;
      guest_count?: number | null;
      budget?: number | null;
      required_services?: string[] | null;
    } | null;
    vendor_stack?: unknown[] | null;
    timeline?: unknown[] | null;
    tasks?: unknown[] | null;
  } | null;
};

type EventLite = { id: string; name: string; type?: string | null; status?: string | null };

function money(n?: number | null) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function PlaybookLibrary() {
  const nav = useNavigate();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Save-as-playbook form
  const [saving, setSaving] = useState(false);
  const [saveEventId, setSaveEventId] = useState('');
  const [saveName, setSaveName] = useState('');
  const [saveType, setSaveType] = useState('');

  // Clone form
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneDate, setCloneDate] = useState('');
  const [cloneBusy, setCloneBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [pb, ev] = await Promise.all([
        apiGet<{ playbooks: Playbook[] }>('/playbooks'),
        apiGet<{ events: EventLite[] }>('/events'),
      ]);
      setPlaybooks(pb.playbooks || []);
      setEvents(ev.events || []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveAsPlaybook() {
    if (!saveEventId) {
      setError('Pick an event to save as a playbook.');
      return;
    }
    setSaving(true);
    try {
      await apiSend('POST', `/playbooks/from-event/${saveEventId}`, {
        name: saveName || undefined,
        template_type: saveType || undefined,
      });
      setSaveEventId('');
      setSaveName('');
      setSaveType('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startClone(p: Playbook) {
    setCloningId(p.id);
    setCloneName(`${p.name} (clone)`);
    setCloneDate('');
    setError(null);
  }

  async function doClone() {
    if (!cloningId) return;
    setCloneBusy(true);
    try {
      const body: Record<string, unknown> = {};
      if (cloneName) body.name = cloneName;
      if (cloneDate) body.date_time = new Date(cloneDate).toISOString();
      const res = await apiSend<{ event: { id: string } }>(
        'POST',
        `/playbooks/${cloningId}/clone`,
        body,
      );
      const newId = res?.event?.id;
      setCloningId(null);
      if (newId) {
        nav(`/events/${newId}`);
      } else {
        await load();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCloneBusy(false);
    }
  }

  const typeChips = useMemo(() => {
    const set = new Set<string>();
    for (const p of playbooks) {
      const t = p.template_type || p.payload?.event_meta?.type;
      if (t) set.add(t);
    }
    return [...set];
  }, [playbooks]);
  const [filter, setFilter] = useState<string | null>(null);
  const shown = filter
    ? playbooks.filter((p) => (p.template_type || p.payload?.event_meta?.type) === filter)
    : playbooks;

  return (
    <div className="pbk">
      <style>{CSS}</style>

      <header className="pbk-head">
        <div>
          <span className="pbk-kicker">Intelligence Moat</span>
          <h1 className="pbk-title">Event Playbooks</h1>
          <p className="pbk-sub">
            Save a whole event as a reusable playbook, then clone it to spin up the next event with
            its venue setup, vendor stack, timeline and tasks already in place.
          </p>
        </div>
      </header>

      {error && <div className="pbk-error">{error}</div>}

      <section className="pbk-form">
        <h2>Save an event as a playbook</h2>
        <div className="pbk-grid">
          <label>
            Event
            <select value={saveEventId} onChange={(e) => setSaveEventId(e.target.value)}>
              <option value="">Select an event.</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}
                  {ev.status ? ` (${ev.status})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Playbook name
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Leave blank to use the event name"
            />
          </label>
          <label>
            Template type
            <input
              value={saveType}
              onChange={(e) => setSaveType(e.target.value)}
              placeholder="gala, conference, wedding..."
            />
          </label>
        </div>
        <div className="pbk-form-actions">
          <button type="button" className="pbk-btn" disabled={saving} onClick={saveAsPlaybook}>
            {saving ? 'Saving.' : 'Save as playbook'}
          </button>
        </div>
      </section>

      {typeChips.length > 0 && (
        <div className="pbk-filters">
          <button
            type="button"
            className={`pbk-chip ${filter === null ? 'on' : ''}`}
            onClick={() => setFilter(null)}
          >
            All
          </button>
          {typeChips.map((t) => (
            <button
              key={t}
              type="button"
              className={`pbk-chip ${filter === t ? 'on' : ''}`}
              onClick={() => setFilter(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      <h2 className="pbk-section">Playbooks</h2>
      {loading ? (
        <div className="pbk-empty">Loading.</div>
      ) : shown.length === 0 ? (
        <div className="pbk-empty">
          No playbooks yet. Save an event above to create your first reusable playbook.
        </div>
      ) : (
        <div className="pbk-list">
          {shown.map((p) => {
            const meta = p.payload?.event_meta || {};
            const type = p.template_type || meta.type;
            const vendors = p.payload?.vendor_stack?.length ?? 0;
            const timeline = p.payload?.timeline?.length ?? 0;
            const tasks = p.payload?.tasks?.length ?? 0;
            return (
              <article key={p.id} className="pbk-card">
                <div className="pbk-card-top">
                  <h3>{p.name}</h3>
                  {type ? <span className="pbk-tag">{type}</span> : null}
                </div>
                <p className="pbk-meta">
                  {meta.guest_count ? `${meta.guest_count} guests` : ''}
                  {meta.guest_count && money(meta.budget ?? null) ? ' · ' : ''}
                  {money(meta.budget ?? null) ? `${money(meta.budget ?? null)} budget` : ''}
                </p>
                <div className="pbk-counts">
                  <span>{vendors} vendors</span>
                  <span>{timeline} timeline</span>
                  <span>{tasks} tasks</span>
                </div>

                {cloningId === p.id ? (
                  <div className="pbk-clone">
                    <label>
                      New event name
                      <input value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
                    </label>
                    <label>
                      Event date
                      <input
                        type="datetime-local"
                        value={cloneDate}
                        onChange={(e) => setCloneDate(e.target.value)}
                      />
                    </label>
                    <div className="pbk-clone-actions">
                      <button
                        type="button"
                        className="pbk-btn ghost sm"
                        onClick={() => setCloningId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="pbk-btn sm"
                        disabled={cloneBusy}
                        onClick={doClone}
                      >
                        {cloneBusy ? 'Creating.' : 'Create event'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pbk-actions">
                    <button type="button" className="pbk-btn sm" onClick={() => startClone(p)}>
                      Clone to new event
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CSS = `
.pbk { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.pbk *,.pbk *::before,.pbk *::after { box-sizing:border-box; }
.pbk h1,.pbk h2,.pbk h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.pbk-head { margin-bottom:20px; }
.pbk-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.pbk-title { font-size:28px; color:var(--e); line-height:1.1; }
.pbk-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:680px; line-height:1.55; }
.pbk-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.pbk-form { background:#fff; border:1px solid var(--ln); border-radius:16px; padding:20px; margin-bottom:22px; }
.pbk-form h2 { font-size:21px; color:var(--e); margin-bottom:14px; }
.pbk-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
.pbk-grid label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.pbk-grid input,.pbk-grid select { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.pbk-form-actions { display:flex; justify-content:flex-end; margin-top:14px; }
.pbk-section { font-size:20px; color:var(--e); margin:8px 0 12px; }
.pbk-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 18px; cursor:pointer; }
.pbk-btn:hover { background:var(--e2); }
.pbk-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.pbk-btn.sm { padding:6px 13px; font-size:11.5px; }
.pbk-btn:disabled { opacity:.55; cursor:default; }
.pbk-filters { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
.pbk-chip { font-size:11px; color:var(--e); background:rgba(18,60,46,.06); border:1px solid var(--ln); border-radius:999px; padding:4px 12px; text-transform:capitalize; cursor:pointer; font:inherit; font-weight:600; }
.pbk-chip.on { background:var(--e); color:#fff; border-color:var(--e); }
.pbk-empty { padding:36px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.pbk-list { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
.pbk-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px; display:flex; flex-direction:column; gap:8px; }
.pbk-card-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.pbk-card h3 { font-size:18px; color:var(--e); }
.pbk-tag { font-size:10px; letter-spacing:.5px; text-transform:uppercase; font-weight:600; padding:2px 8px; border-radius:999px; background:rgba(201,163,91,.2); color:#7a5e22; }
.pbk-meta { font-size:11.5px; color:var(--mut); margin:0; }
.pbk-counts { display:flex; gap:8px; flex-wrap:wrap; }
.pbk-counts span { font-size:10.5px; color:var(--e); background:rgba(18,60,46,.06); border:1px solid var(--ln); border-radius:999px; padding:2px 9px; }
.pbk-actions { margin-top:auto; padding-top:6px; }
.pbk-clone { margin-top:auto; padding-top:8px; display:flex; flex-direction:column; gap:8px; border-top:1px solid var(--ln); }
.pbk-clone label { display:flex; flex-direction:column; gap:4px; font-size:11.5px; color:var(--mut); font-weight:600; }
.pbk-clone input { font:inherit; font-size:12.5px; padding:7px 9px; border:1px solid var(--ln); border-radius:8px; }
.pbk-clone-actions { display:flex; justify-content:flex-end; gap:8px; }
@media (max-width:980px){ .pbk-list { grid-template-columns:repeat(2,1fr); } .pbk-grid { grid-template-columns:1fr; } }
@media (max-width:620px){ .pbk-list { grid-template-columns:1fr; } }
`;
