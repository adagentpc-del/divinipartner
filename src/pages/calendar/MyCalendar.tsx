/**
 * Availability calendar (bookings, holds, installs, deliveries, meetings).
 * Route: /calendar. Every org type gets one: venues/vendors show it as
 * availability on their public profile; installers/planners/etc. use it to
 * track installs, deliveries, and meetings.
 *
 * Subscribing from Apple/Google Calendar is one-way (webcal subscribe feed,
 * lib/ics.ts / routes/calendar.ts): those apps pull from us on their own
 * refresh schedule. Nothing syncs back into this app.
 *
 * Tentative "hold" rows (kind: hold, status: tentative) are created by a
 * DIFFERENT org's "Request this date" action on your public profile - they
 * show with a Confirm / Decline action so you can turn a hold into a real
 * booking or free the date back up.
 *
 * Zero em dashes.
 */
import { useEffect, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';

type Kind = 'booking' | 'hold' | 'block' | 'install' | 'delivery' | 'meeting' | 'other';
type Status = 'confirmed' | 'tentative' | 'cancelled';

type CalendarEventRow = {
  id: string;
  event_id: string | null;
  kind: Kind;
  status: Status;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
};

type FeedInfo = { token: string; feed_url: string; webcal_url: string };

const KIND_LABELS: Record<Kind, string> = {
  booking: 'Booking', hold: 'Hold', block: 'Block', install: 'Install',
  delivery: 'Delivery', meeting: 'Meeting', other: 'Other',
};
const KIND_OPTIONS: Kind[] = ['booking', 'hold', 'block', 'install', 'delivery', 'meeting', 'other'];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const emptyForm = { title: '', kind: 'other' as Kind, starts_at: '', ends_at: '', all_day: false, description: '' };

export default function MyCalendar() {
  const [events, setEvents] = useState<CalendarEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);

  const [feed, setFeed] = useState<FeedInfo | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await apiGet<{ events: CalendarEventRow[] }>('/calendar');
      setEvents(r.events);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function loadFeed() {
    setFeedBusy(true);
    try {
      const r = await apiGet<FeedInfo>('/calendar/feed-token');
      setFeed(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setFeedBusy(false);
    }
  }

  async function rotateFeed() {
    if (!confirm('Rotate your subscribe link? Anyone using the old link (including your own Apple/Google Calendar subscription) will stop receiving updates until you re-subscribe with the new link.')) return;
    setFeedBusy(true);
    try {
      const r = await apiSend<FeedInfo>('POST', '/calendar/feed-token/rotate', {});
      setFeed(r);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setFeedBusy(false);
    }
  }

  async function copyLink() {
    if (!feed) return;
    try {
      await navigator.clipboard.writeText(feed.webcal_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may be unavailable; the link is still visible to select */ }
  }

  async function addEvent() {
    if (!form.title.trim() || !form.starts_at || !form.ends_at) {
      setErr('Title, start, and end are required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await apiSend('POST', '/calendar', {
        title: form.title.trim(),
        kind: form.kind,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        all_day: form.all_day,
        description: form.description.trim() || null,
      });
      setForm(emptyForm);
      setShowAdd(false);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function startEdit(ev: CalendarEventRow) {
    setEditingId(ev.id);
    setEditForm({
      title: ev.title,
      kind: ev.kind,
      starts_at: toLocalInput(ev.starts_at),
      ends_at: toLocalInput(ev.ends_at),
      all_day: ev.all_day,
      description: ev.description ?? '',
    });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setErr(null);
    try {
      await apiSend('PATCH', `/calendar/${id}`, {
        title: editForm.title.trim(),
        kind: editForm.kind,
        starts_at: new Date(editForm.starts_at).toISOString(),
        ends_at: new Date(editForm.ends_at).toISOString(),
        all_day: editForm.all_day,
        description: editForm.description.trim() || null,
      });
      setEditingId(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: Status) {
    setErr(null);
    try {
      await apiSend('PATCH', `/calendar/${id}`, { status });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this calendar event?')) return;
    setErr(null);
    try {
      await apiSend('DELETE', `/calendar/${id}`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const pendingHolds = events.filter((e) => e.status === 'tentative');
  const rest = events.filter((e) => e.status !== 'tentative');

  return (
    <div className="cal">
      <style>{CSS}</style>
      <header className="cal-head">
        <div>
          <span className="cal-kicker">Availability</span>
          <h1 className="cal-title">Calendar</h1>
          <p className="cal-sub">Bookings, holds, installs, deliveries, and meetings. Clients see your busy dates on your public profile; you subscribe to this from Apple or Google Calendar.</p>
        </div>
        <button type="button" className="cal-btn" onClick={() => { setShowAdd((v) => !v); setForm(emptyForm); }}>
          {showAdd ? 'Cancel' : '+ Add to calendar'}
        </button>
      </header>

      {err ? <p className="cal-error">{err}</p> : null}

      {showAdd ? (
        <div className="cal-form">
          <div className="cal-formrow">
            <label>Title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Smith Wedding load-in" />
            </label>
            <label>Kind
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
                {KIND_OPTIONS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
              </select>
            </label>
          </div>
          <div className="cal-formrow">
            <label>Starts
              <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} />
            </label>
            <label>Ends
              <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
            </label>
            <label className="cal-checklabel">
              <input type="checkbox" checked={form.all_day} onChange={(e) => setForm({ ...form, all_day: e.target.checked })} />
              All day
            </label>
          </div>
          <label>Notes
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          </label>
          <div className="cal-formactions">
            <button type="button" className="cal-btn" disabled={saving} onClick={addEvent}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      ) : null}

      {pendingHolds.length > 0 ? (
        <section className="cal-section">
          <h2 className="cal-h2">Requests awaiting your confirmation</h2>
          <div className="cal-list">
            {pendingHolds.map((ev) => (
              <div className="cal-row cal-row-hold" key={ev.id}>
                <div className="cal-rowmain">
                  <span className="cal-rowtitle">{ev.title}</span>
                  <span className="cal-rowwhen">{fmt(ev.starts_at)} - {fmt(ev.ends_at)}</span>
                  {ev.description ? <p className="cal-rowdesc">{ev.description}</p> : null}
                </div>
                <div className="cal-rowactions">
                  <button type="button" className="cal-btn sm" onClick={() => setStatus(ev.id, 'confirmed')}>Confirm</button>
                  <button type="button" className="cal-btn ghost sm" onClick={() => setStatus(ev.id, 'cancelled')}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="cal-section">
        <h2 className="cal-h2">Upcoming</h2>
        {loading ? <p className="cal-muted">Loading...</p> : null}
        {!loading && rest.length === 0 ? <p className="cal-muted">Nothing on your calendar yet. Add a booking, install, delivery, or meeting above.</p> : null}
        <div className="cal-list">
          {rest.map((ev) => (
            <div className={`cal-row${ev.status === 'cancelled' ? ' is-cancelled' : ''}`} key={ev.id}>
              {editingId === ev.id ? (
                <div className="cal-editform">
                  <div className="cal-formrow">
                    <label>Title
                      <input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                    </label>
                    <label>Kind
                      <select value={editForm.kind} onChange={(e) => setEditForm({ ...editForm, kind: e.target.value as Kind })}>
                        {KIND_OPTIONS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="cal-formrow">
                    <label>Starts
                      <input type="datetime-local" value={editForm.starts_at} onChange={(e) => setEditForm({ ...editForm, starts_at: e.target.value })} />
                    </label>
                    <label>Ends
                      <input type="datetime-local" value={editForm.ends_at} onChange={(e) => setEditForm({ ...editForm, ends_at: e.target.value })} />
                    </label>
                  </div>
                  <div className="cal-formactions">
                    <button type="button" className="cal-btn ghost sm" onClick={() => setEditingId(null)}>Cancel</button>
                    <button type="button" className="cal-btn sm" disabled={saving} onClick={() => saveEdit(ev.id)}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="cal-rowmain">
                    <span className="cal-rowkind">{KIND_LABELS[ev.kind]}</span>
                    <span className="cal-rowtitle">{ev.title}</span>
                    <span className="cal-rowwhen">{ev.all_day ? fmt(ev.starts_at).split(',')[0] : `${fmt(ev.starts_at)} - ${fmt(ev.ends_at)}`}</span>
                    {ev.status === 'cancelled' ? <span className="cal-badge">Cancelled</span> : null}
                  </div>
                  <div className="cal-rowactions">
                    <button type="button" className="cal-btn ghost sm" onClick={() => startEdit(ev)}>Edit</button>
                    <button type="button" className="cal-btn ghost sm" onClick={() => remove(ev.id)}>Remove</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="cal-section cal-subscribe">
        <h2 className="cal-h2">Subscribe from Apple or Google Calendar</h2>
        <p className="cal-muted">Add this as a subscribed calendar and your bookings, holds, and installs show up there automatically (updates roughly hourly). This is one-way: changes you make in Apple or Google do not come back into Divini Partners.</p>
        {!feed ? (
          <button type="button" className="cal-btn ghost" disabled={feedBusy} onClick={loadFeed}>
            {feedBusy ? 'Loading...' : 'Get my subscribe link'}
          </button>
        ) : (
          <div className="cal-feedbox">
            <code className="cal-feedurl">{feed.webcal_url}</code>
            <div className="cal-formactions">
              <button type="button" className="cal-btn ghost sm" onClick={copyLink}>{copied ? 'Copied' : 'Copy link'}</button>
              <button type="button" className="cal-btn ghost sm" disabled={feedBusy} onClick={rotateFeed}>Rotate link</button>
            </div>
            <p className="cal-muted small">
              Apple Calendar: File → New Calendar Subscription, paste the link. Google Calendar: Other calendars → From URL, paste the link (use the https version, not webcal).
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

const CSS = `
.cal { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:900px; margin: 0 auto; padding: 28px 20px 60px; }
.cal *,.cal *::before,.cal *::after { box-sizing:border-box; }
.cal h1,.cal h2 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.cal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:20px; }
.cal-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.cal-title { font-size:28px; color:var(--e); line-height:1.1; }
.cal-sub { font-size:13px; color:var(--mut); margin:6px 0 0; max-width:520px; }
.cal-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.cal-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 18px; cursor:pointer; }
.cal-btn:hover { background:var(--e2); }
.cal-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.cal-btn.sm { padding:6px 12px; font-size:12px; }
.cal-btn:disabled { opacity:.55; cursor:default; }
.cal-form, .cal-editform { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px 20px; display:flex; flex-direction:column; gap:12px; margin-bottom:20px; }
.cal-form label, .cal-editform label { display:flex; flex-direction:column; gap:5px; font-size:12px; font-weight:600; color:var(--mut); flex:1 1 160px; }
.cal-form input, .cal-form select, .cal-form textarea,
.cal-editform input, .cal-editform select { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:8px; background:#fff; color:var(--ink); }
.cal-formrow { display:flex; gap:14px; flex-wrap:wrap; }
.cal-checklabel { flex-direction:row !important; align-items:center; gap:6px !important; }
.cal-formactions { display:flex; justify-content:flex-end; gap:8px; }
.cal-section { margin-bottom:26px; }
.cal-h2 { font-size:18px; color:var(--e); margin-bottom:10px; }
.cal-muted { color:var(--mut); font-size:12.5px; }
.cal-muted.small { font-size:11.5px; margin-top:10px; }
.cal-list { display:flex; flex-direction:column; gap:8px; }
.cal-row { background:#fff; border:1px solid var(--ln); border-radius:10px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.cal-row.is-cancelled { opacity:.55; }
.cal-row-hold { border-color: rgba(201,163,91,.5); background: rgba(201,163,91,.08); }
.cal-rowmain { display:flex; align-items:center; gap:10px; flex-wrap:wrap; flex:1 1 300px; }
.cal-rowkind { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; color:var(--g); background:rgba(201,163,91,.15); border-radius:999px; padding:2px 9px; }
.cal-rowtitle { font-weight:700; color:var(--e); font-size:13.5px; }
.cal-rowwhen { font-size:12px; color:var(--mut); }
.cal-rowdesc { margin:4px 0 0; font-size:12px; color:var(--mut); width:100%; }
.cal-badge { font-size:10.5px; font-weight:700; text-transform:uppercase; color:#9a3a28; background:#fff3f1; border-radius:999px; padding:2px 9px; }
.cal-rowactions { display:flex; gap:8px; }
.cal-subscribe { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:18px 20px; }
.cal-feedbox { margin-top:10px; }
.cal-feedurl { display:block; background:var(--iv); border:1px solid var(--ln); border-radius:8px; padding:10px 12px; font-size:12px; word-break:break-all; margin-bottom:10px; }
`;
