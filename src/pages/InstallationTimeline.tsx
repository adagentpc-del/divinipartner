import React, { useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

// Friction Elimination - U14 Installation Management. The shared venue / vendor /
// planner timeline for getting a vendor in and out of a venue: arrival, setup
// window, live progress, completion photos, removal schedule and the venue's
// sign-off. The page is event-scoped: enter an event id, then manage that
// event's installation rows. Reads/writes go through /api/installations
// (org-scoped + IDOR-safe server side, so a forged event id from another tenant
// is rejected).

type Installation = {
  id: string;
  event_id: string;
  vendor_id?: string | null;
  arrival_time?: string | null;
  setup_window?: { start?: string; end?: string } | null;
  status?: string | null;
  progress?: number | null;
  completion_photos?: string[] | null;
  removal_schedule?: { start?: string; end?: string } | null;
  venue_approved?: boolean | null;
  notes?: string | null;
};

type StatusMeta = { key: string; label: string };

type Draft = {
  vendor_id: string;
  arrival_time: string;
  setup_start: string;
  setup_end: string;
  removal_start: string;
  removal_end: string;
  status: string;
  progress: string;
  completion_photos: string;
  notes: string;
};

const EMPTY: Draft = {
  vendor_id: '',
  arrival_time: '',
  setup_start: '',
  setup_end: '',
  removal_start: '',
  removal_end: '',
  status: 'scheduled',
  progress: '0',
  completion_photos: '',
  notes: '',
};

function fmt(ts?: string | null): string {
  if (!ts) return '-';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function fmtWindow(w?: { start?: string; end?: string } | null): string {
  if (!w) return '-';
  const s = w.start ? fmt(w.start) : '?';
  const e = w.end ? fmt(w.end) : '?';
  return `${s} to ${e}`;
}

export default function InstallationTimeline() {
  const [eventId, setEventId] = useState('');
  const [activeEvent, setActiveEvent] = useState('');
  const [rows, setRows] = useState<Installation[]>([]);
  const [statuses, setStatuses] = useState<StatusMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [saving, setSaving] = useState(false);

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    try {
      if (statuses.length === 0) {
        const meta = await apiGet<{ statuses: StatusMeta[] }>('/installations/meta');
        setStatuses(meta.statuses || []);
      }
      const res = await apiGet<{ installations: Installation[] }>(`/installations/event/${id}`);
      setRows(res.installations || []);
      setActiveEvent(id);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  function draftFrom(r: Installation): Draft {
    return {
      vendor_id: r.vendor_id || '',
      arrival_time: r.arrival_time ? r.arrival_time.slice(0, 16) : '',
      setup_start: r.setup_window?.start ? r.setup_window.start.slice(0, 16) : '',
      setup_end: r.setup_window?.end ? r.setup_window.end.slice(0, 16) : '',
      removal_start: r.removal_schedule?.start ? r.removal_schedule.start.slice(0, 16) : '',
      removal_end: r.removal_schedule?.end ? r.removal_schedule.end.slice(0, 16) : '',
      status: r.status || 'scheduled',
      progress: String(r.progress ?? 0),
      completion_photos: (r.completion_photos || []).join('\n'),
      notes: r.notes || '',
    };
  }

  function buildBody(d: Draft) {
    const photos = d.completion_photos
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      vendor_id: d.vendor_id.trim() || null,
      arrival_time: d.arrival_time ? new Date(d.arrival_time).toISOString() : null,
      setup_window:
        d.setup_start || d.setup_end
          ? {
              start: d.setup_start ? new Date(d.setup_start).toISOString() : undefined,
              end: d.setup_end ? new Date(d.setup_end).toISOString() : undefined,
            }
          : null,
      removal_schedule:
        d.removal_start || d.removal_end
          ? {
              start: d.removal_start ? new Date(d.removal_start).toISOString() : undefined,
              end: d.removal_end ? new Date(d.removal_end).toISOString() : undefined,
            }
          : null,
      status: d.status,
      progress: Number(d.progress) || 0,
      completion_photos: photos.length ? photos : null,
      notes: d.notes.trim() || null,
    };
  }

  async function save() {
    if (!editing || !activeEvent) return;
    setSaving(true);
    try {
      const body = buildBody(editing.draft);
      if (editing.id) {
        await apiSend('PATCH', `/installations/${editing.id}`, body);
      } else {
        await apiSend('POST', `/installations/event/${activeEvent}`, body);
      }
      setEditing(null);
      await load(activeEvent);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function bumpProgress(r: Installation, progress: number) {
    try {
      await apiSend('POST', `/installations/${r.id}/progress`, { progress });
      await load(activeEvent);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function approve(r: Installation, approved: boolean) {
    try {
      await apiSend('POST', `/installations/${r.id}/venue-approve`, { approved });
      await load(activeEvent);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(r: Installation) {
    if (!window.confirm('Remove this installation from the timeline?')) return;
    try {
      await apiSend('DELETE', `/installations/${r.id}`);
      await load(activeEvent);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function statusLabel(key?: string | null): string {
    return statuses.find((s) => s.key === key)?.label ?? (key || 'Scheduled');
  }

  return (
    <div className="it">
      <style>{CSS}</style>

      <header className="it-head">
        <div>
          <span className="it-kicker">Shared Timeline</span>
          <h1 className="it-title">Installation Management</h1>
          <p className="it-sub">
            One shared timeline for venue, vendor and planner: arrival, setup window, live progress,
            completion photos, removal schedule and venue sign-off.
          </p>
        </div>
      </header>

      <form
        className="it-bar"
        onSubmit={(e) => {
          e.preventDefault();
          load(eventId.trim());
        }}
      >
        <label>
          Event ID
          <input
            value={eventId}
            placeholder="Paste your event id"
            onChange={(e) => setEventId(e.target.value)}
          />
        </label>
        <button type="submit" className="it-btn">Load timeline</button>
        {activeEvent && (
          <button type="button" className="it-btn" onClick={() => setEditing({ id: null, draft: { ...EMPTY } })}>
            Add installation
          </button>
        )}
      </form>

      {error && <div className="it-error">{error}</div>}

      {!activeEvent ? (
        <div className="it-empty">Enter an event id above to manage its installation timeline.</div>
      ) : loading ? (
        <div className="it-empty">Loading timeline.</div>
      ) : rows.length === 0 ? (
        <div className="it-empty">No installations yet. Add the first vendor load-in.</div>
      ) : (
        <div className="it-list">
          {rows.map((r) => (
            <article key={r.id} className="it-card">
              <div className="it-card-top">
                <span className={`it-status it-st-${r.status ?? 'scheduled'}`}>{statusLabel(r.status)}</span>
                {r.venue_approved ? (
                  <span className="it-approved">Venue approved</span>
                ) : (
                  <span className="it-pending">Awaiting venue</span>
                )}
              </div>

              <div className="it-grid">
                <div>
                  <strong>Vendor</strong>
                  <code>{r.vendor_id || '-'}</code>
                </div>
                <div>
                  <strong>Arrival</strong>
                  <span>{fmt(r.arrival_time)}</span>
                </div>
                <div>
                  <strong>Setup window</strong>
                  <span>{fmtWindow(r.setup_window)}</span>
                </div>
                <div>
                  <strong>Removal</strong>
                  <span>{fmtWindow(r.removal_schedule)}</span>
                </div>
              </div>

              <div className="it-progress">
                <div className="it-progress-bar">
                  <div className="it-progress-fill" style={{ width: `${r.progress ?? 0}%` }} />
                </div>
                <span className="it-progress-pct">{r.progress ?? 0}%</span>
              </div>
              <div className="it-quick">
                {[0, 25, 50, 75, 100].map((p) => (
                  <button key={p} type="button" className="it-chip" onClick={() => bumpProgress(r, p)}>
                    {p}%
                  </button>
                ))}
              </div>

              {Array.isArray(r.completion_photos) && r.completion_photos.length > 0 && (
                <div className="it-photos">
                  {r.completion_photos.map((p, i) => (
                    <a key={i} href={p} target="_blank" rel="noreferrer" className="it-photo-link">
                      Photo {i + 1}
                    </a>
                  ))}
                </div>
              )}

              {r.notes && <p className="it-notes">{r.notes}</p>}

              <div className="it-actions">
                <button type="button" className="it-btn ghost" onClick={() => setEditing({ id: r.id, draft: draftFrom(r) })}>
                  Edit
                </button>
                {r.venue_approved ? (
                  <button type="button" className="it-btn ghost" onClick={() => approve(r, false)}>
                    Revoke approval
                  </button>
                ) : (
                  <button type="button" className="it-btn" onClick={() => approve(r, true)}>
                    Venue approve
                  </button>
                )}
                <button type="button" className="it-btn danger" onClick={() => remove(r)}>
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <div className="it-modal" role="dialog" aria-modal="true">
          <div className="it-modal-card">
            <h2>{editing.id ? 'Update installation' : 'Add installation'}</h2>
            <div className="it-form">
              <label className="it-full">
                Vendor ID
                <input
                  value={editing.draft.vendor_id}
                  placeholder="Vendor org id"
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, vendor_id: e.target.value } })}
                />
              </label>
              <label>
                Arrival time
                <input
                  type="datetime-local"
                  value={editing.draft.arrival_time}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, arrival_time: e.target.value } })}
                />
              </label>
              <label>
                Status
                <select
                  value={editing.draft.status}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, status: e.target.value } })}
                >
                  {statuses.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Setup start
                <input
                  type="datetime-local"
                  value={editing.draft.setup_start}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, setup_start: e.target.value } })}
                />
              </label>
              <label>
                Setup end
                <input
                  type="datetime-local"
                  value={editing.draft.setup_end}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, setup_end: e.target.value } })}
                />
              </label>
              <label>
                Removal start
                <input
                  type="datetime-local"
                  value={editing.draft.removal_start}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, removal_start: e.target.value } })}
                />
              </label>
              <label>
                Removal end
                <input
                  type="datetime-local"
                  value={editing.draft.removal_end}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, removal_end: e.target.value } })}
                />
              </label>
              <label>
                Progress (0-100)
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={editing.draft.progress}
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, progress: e.target.value } })}
                />
              </label>
              <label className="it-full">
                Completion photo URLs (one per line)
                <textarea
                  value={editing.draft.completion_photos}
                  placeholder="https://.../setup-1.jpg"
                  onChange={(e) =>
                    setEditing({ ...editing, draft: { ...editing.draft, completion_photos: e.target.value } })
                  }
                />
              </label>
              <label className="it-full">
                Notes
                <textarea
                  value={editing.draft.notes}
                  placeholder="Load-in dock, access codes, crew size."
                  onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, notes: e.target.value } })}
                />
              </label>
            </div>
            <div className="it-modal-actions">
              <button type="button" className="it-btn ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="button" className="it-btn" disabled={saving} onClick={save}>
                {saving ? 'Saving.' : 'Save installation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.it { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.it *,.it *::before,.it *::after { box-sizing:border-box; }
.it h1,.it h2,.it h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.it-head { margin-bottom:18px; }
.it-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.it-title { font-size:28px; color:var(--e); line-height:1.1; }
.it-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:680px; line-height:1.5; }
.it-bar { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
.it-bar label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; flex:1 1 280px; }
.it-bar input { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.it-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.it-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.it-list { display:flex; flex-direction:column; gap:14px; }
.it-card { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:16px 18px; }
.it-card-top { display:flex; gap:10px; align-items:center; margin-bottom:12px; }
.it-status { font-size:11px; letter-spacing:.5px; text-transform:uppercase; padding:3px 12px; border-radius:999px; font-weight:700; background:rgba(30,93,74,.14); color:var(--e2); }
.it-st-complete,.it-st-installed { background:var(--e); color:#fff; }
.it-st-removed { background:rgba(125,119,108,.16); color:var(--mut); }
.it-approved { font-size:11.5px; font-weight:600; color:var(--e); background:rgba(201,163,91,.18); padding:2px 10px; border-radius:999px; }
.it-pending { font-size:11.5px; font-weight:600; color:var(--mut); background:rgba(125,119,108,.12); padding:2px 10px; border-radius:999px; }
.it-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:12px; }
.it-grid strong { display:block; font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:var(--mut); margin-bottom:2px; }
.it-grid code,.it-grid span { font-size:12.5px; color:var(--ink); word-break:break-word; }
.it-progress { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
.it-progress-bar { flex:1; height:8px; background:var(--iv); border-radius:999px; overflow:hidden; border:1px solid var(--ln); }
.it-progress-fill { height:100%; background:linear-gradient(90deg,var(--e2),var(--g)); transition:width .2s; }
.it-progress-pct { font-size:12px; font-weight:700; color:var(--e); min-width:38px; text-align:right; }
.it-quick { display:flex; gap:6px; margin-bottom:10px; flex-wrap:wrap; }
.it-chip { font:inherit; font-size:11.5px; padding:3px 10px; border:1px solid var(--ln); background:#fff; border-radius:999px; cursor:pointer; color:var(--mut); }
.it-chip:hover { border-color:var(--e); color:var(--e); }
.it-photos { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px; }
.it-photo-link { font-size:12px; color:var(--e2); background:rgba(30,93,74,.1); padding:3px 10px; border-radius:999px; text-decoration:none; }
.it-notes { font-size:12.5px; color:var(--mut); margin:0 0 10px; line-height:1.5; }
.it-actions { display:flex; gap:8px; flex-wrap:wrap; }
.it-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 16px; cursor:pointer; }
.it-btn:hover { background:var(--e2); }
.it-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.it-btn.ghost:hover { border-color:var(--e); }
.it-btn.danger { background:transparent; color:#9a3a28; border:1px solid #e7b7ab; }
.it-btn:disabled { opacity:.6; cursor:default; }
.it-modal { position:fixed; inset:0; background:rgba(18,60,46,.4); display:grid; place-items:center; padding:20px; z-index:50; }
.it-modal-card { background:#fff; border-radius:16px; padding:24px; width:100%; max-width:640px; max-height:90vh; overflow:auto; }
.it-modal-card h2 { font-size:24px; color:var(--e); margin-bottom:16px; }
.it-form { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.it-form .it-full { grid-column:1 / -1; }
.it-form label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.it-form input,.it-form select,.it-form textarea { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.it-form textarea { min-height:72px; resize:vertical; }
.it-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
@media (max-width:680px){ .it-form { grid-template-columns:1fr; } }
`;
