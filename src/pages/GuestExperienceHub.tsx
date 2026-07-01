import React, { useState } from 'react';
import { apiGet, apiSend } from '../lib/api';

// Friction Elimination - U15 Guest Experience Hub. The attendee-facing layer:
// self-registration / RSVP / ticketing, QR check-in entry, and per-event
// schedule, venue map, parking and last-minute updates. This is a NEW attendee
// layer that sits alongside the existing planner guest list and event-day
// check-in; it never touches them. Reads/writes go through /api/guest-hub
// (org-scoped + IDOR-safe server side).

type Registration = {
  id: string;
  event_id: string;
  attendee_name?: string | null;
  email?: string | null;
  rsvp_status?: string | null;
  ticket_type?: string | null;
  qr_code?: string | null;
  checked_in?: boolean | null;
  checked_in_at?: string | null;
};

type RsvpMeta = { key: string; label: string };

type EventInfo = {
  schedule?: { time?: string; title?: string }[] | null;
  venue_map_url?: string | null;
  parking_info?: string | null;
  updates?: { at?: string; message?: string }[] | null;
};

const REG_EMPTY = { attendee_name: '', email: '', ticket_type: '', rsvp_status: 'pending' };

export default function GuestExperienceHub() {
  const [eventId, setEventId] = useState('');
  const [activeEvent, setActiveEvent] = useState('');
  const [tab, setTab] = useState<'attendees' | 'info'>('attendees');
  const [regs, setRegs] = useState<Registration[]>([]);
  const [rsvpStatuses, setRsvpStatuses] = useState<RsvpMeta[]>([]);
  const [info, setInfo] = useState<EventInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<typeof REG_EMPTY | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanCode, setScanCode] = useState('');
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  // info editor draft
  const [scheduleText, setScheduleText] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [parking, setParking] = useState('');
  const [updatesText, setUpdatesText] = useState('');

  async function load(id: string) {
    if (!id) return;
    setLoading(true);
    try {
      if (rsvpStatuses.length === 0) {
        const meta = await apiGet<{ rsvp_statuses: RsvpMeta[] }>('/guest-hub/meta');
        setRsvpStatuses(meta.rsvp_statuses || []);
      }
      const res = await apiGet<{ registrations: Registration[] }>(`/guest-hub/event/${id}`);
      setRegs(res.registrations || []);
      const infoRes = await apiGet<{ info: EventInfo | null }>(`/guest-hub/info/${id}`);
      applyInfo(infoRes.info);
      setActiveEvent(id);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setRegs([]);
    } finally {
      setLoading(false);
    }
  }

  function applyInfo(i: EventInfo | null) {
    setInfo(i);
    setScheduleText(
      (i?.schedule || []).map((s) => `${s.time ?? ''} | ${s.title ?? ''}`).join('\n'),
    );
    setMapUrl(i?.venue_map_url || '');
    setParking(i?.parking_info || '');
    setUpdatesText((i?.updates || []).map((u) => u.message ?? '').join('\n'));
  }

  async function addReg() {
    if (!adding || !activeEvent) return;
    setSaving(true);
    try {
      await apiSend('POST', `/guest-hub/event/${activeEvent}`, {
        attendee_name: adding.attendee_name.trim() || null,
        email: adding.email.trim() || null,
        ticket_type: adding.ticket_type.trim() || null,
        rsvp_status: adding.rsvp_status,
      });
      setAdding(null);
      await load(activeEvent);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function setRsvp(r: Registration, status: string) {
    try {
      await apiSend('POST', `/guest-hub/${r.id}/rsvp`, { status });
      await load(activeEvent);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeReg(r: Registration) {
    if (!window.confirm('Remove this registration?')) return;
    try {
      await apiSend('DELETE', `/guest-hub/${r.id}`);
      await load(activeEvent);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function checkIn() {
    const qr = scanCode.trim();
    if (!qr) return;
    setScanMsg(null);
    try {
      const res = await apiSend<{ registration: Registration }>('POST', '/guest-hub/checkin', {
        qr_code: qr,
      });
      const name = res.registration?.attendee_name || res.registration?.email || 'Attendee';
      setScanMsg(`Checked in: ${name}`);
      setScanCode('');
      await load(activeEvent);
    } catch (e) {
      setScanMsg(`Not found or no access: ${(e as Error).message}`);
    }
  }

  async function saveInfo() {
    if (!activeEvent) return;
    setSaving(true);
    try {
      const schedule = scheduleText
        .split('\n')
        .map((line) => {
          const [time, ...rest] = line.split('|');
          const title = rest.join('|').trim();
          if (!time.trim() && !title) return null;
          return { time: time.trim(), title };
        })
        .filter(Boolean);
      const updates = updatesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((message) => ({ at: new Date().toISOString(), message }));
      const res = await apiSend<{ info: EventInfo }>('PUT', `/guest-hub/info/${activeEvent}`, {
        schedule,
        venue_map_url: mapUrl.trim() || null,
        parking_info: parking.trim() || null,
        ...(updates.length ? { updates } : {}),
      });
      applyInfo(res.info);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function rsvpLabel(key?: string | null): string {
    return rsvpStatuses.find((s) => s.key === key)?.label ?? (key || 'Pending');
  }

  const checkedInCount = regs.filter((r) => r.checked_in).length;

  return (
    <div className="gx">
      <style>{CSS}</style>

      <header className="gx-head">
        <div>
          <span className="gx-kicker">Attendee Experience</span>
          <h1 className="gx-title">Guest Experience Hub</h1>
          <p className="gx-sub">
            Registration, RSVP and ticketing, QR check-in, plus the attendee schedule, venue map,
            parking and last-minute updates. Separate from your private planner guest list.
          </p>
        </div>
      </header>

      <form
        className="gx-bar"
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
        <button type="submit" className="gx-btn">Load hub</button>
      </form>

      {error && <div className="gx-error">{error}</div>}

      {!activeEvent ? (
        <div className="gx-empty">Enter an event id above to manage its guest experience.</div>
      ) : loading ? (
        <div className="gx-empty">Loading hub.</div>
      ) : (
        <>
          <div className="gx-tabs">
            <button className={tab === 'attendees' ? 'on' : ''} onClick={() => setTab('attendees')}>
              Attendees ({regs.length}, {checkedInCount} in)
            </button>
            <button className={tab === 'info' ? 'on' : ''} onClick={() => setTab('info')}>
              Event info
            </button>
          </div>

          {tab === 'attendees' && (
            <>
              <div className="gx-scan">
                <label>
                  QR check-in
                  <input
                    value={scanCode}
                    placeholder="Scan or paste QR code"
                    onChange={(e) => setScanCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        checkIn();
                      }
                    }}
                  />
                </label>
                <button type="button" className="gx-btn" onClick={checkIn}>Check in</button>
                <button type="button" className="gx-btn ghost" onClick={() => setAdding({ ...REG_EMPTY })}>
                  Add attendee
                </button>
              </div>
              {scanMsg && <div className="gx-scanmsg">{scanMsg}</div>}

              {regs.length === 0 ? (
                <div className="gx-empty">No registrations yet. Add the first attendee.</div>
              ) : (
                <div className="gx-list">
                  {regs.map((r) => (
                    <article key={r.id} className="gx-card">
                      <div className="gx-card-main">
                        <div className="gx-who">
                          <strong>{r.attendee_name || '(no name)'}</strong>
                          <span>{r.email || '-'}</span>
                        </div>
                        {r.ticket_type && <span className="gx-ticket">{r.ticket_type}</span>}
                        <span className={`gx-rsvp gx-r-${r.rsvp_status ?? 'pending'}`}>{rsvpLabel(r.rsvp_status)}</span>
                        {r.checked_in && <span className="gx-in">Checked in</span>}
                        {r.qr_code && <code className="gx-qr">{r.qr_code}</code>}
                      </div>
                      <div className="gx-actions">
                        <select
                          value={r.rsvp_status || 'pending'}
                          onChange={(e) => setRsvp(r, e.target.value)}
                        >
                          {rsvpStatuses.map((s) => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                          ))}
                        </select>
                        <button type="button" className="gx-btn danger" onClick={() => removeReg(r)}>
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'info' && (
            <div className="gx-info">
              <label className="gx-full">
                Schedule (one per line: time | title)
                <textarea
                  value={scheduleText}
                  placeholder={'6:00 PM | Doors open\n7:30 PM | Keynote'}
                  onChange={(e) => setScheduleText(e.target.value)}
                />
              </label>
              <label className="gx-full">
                Venue map URL
                <input
                  value={mapUrl}
                  placeholder="https://.../venue-map.png"
                  onChange={(e) => setMapUrl(e.target.value)}
                />
              </label>
              <label className="gx-full">
                Parking info
                <textarea
                  value={parking}
                  placeholder="Self-park in the north garage. Valet at the main entrance."
                  onChange={(e) => setParking(e.target.value)}
                />
              </label>
              <label className="gx-full">
                Add last-minute updates (one per line, appended on save)
                <textarea
                  value={updatesText}
                  placeholder="Start time moved to 7:45 PM."
                  onChange={(e) => setUpdatesText(e.target.value)}
                />
              </label>
              <div className="gx-info-actions">
                <button type="button" className="gx-btn" disabled={saving} onClick={saveInfo}>
                  {saving ? 'Saving.' : 'Save event info'}
                </button>
              </div>

              {info?.updates && info.updates.length > 0 && (
                <div className="gx-updates">
                  <strong>Posted updates</strong>
                  <ul>
                    {info.updates.map((u, i) => (
                      <li key={i}>
                        <span className="gx-update-at">{u.at ? new Date(u.at).toLocaleString() : ''}</span>
                        {u.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {adding && (
        <div className="gx-modal" role="dialog" aria-modal="true">
          <div className="gx-modal-card">
            <h2>Add attendee</h2>
            <div className="gx-form">
              <label className="gx-full">
                Name
                <input
                  value={adding.attendee_name}
                  onChange={(e) => setAdding({ ...adding, attendee_name: e.target.value })}
                />
              </label>
              <label className="gx-full">
                Email
                <input
                  value={adding.email}
                  onChange={(e) => setAdding({ ...adding, email: e.target.value })}
                />
              </label>
              <label>
                Ticket type
                <input
                  value={adding.ticket_type}
                  placeholder="General / VIP"
                  onChange={(e) => setAdding({ ...adding, ticket_type: e.target.value })}
                />
              </label>
              <label>
                RSVP
                <select
                  value={adding.rsvp_status}
                  onChange={(e) => setAdding({ ...adding, rsvp_status: e.target.value })}
                >
                  {rsvpStatuses.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="gx-modal-actions">
              <button type="button" className="gx-btn ghost" onClick={() => setAdding(null)}>
                Cancel
              </button>
              <button type="button" className="gx-btn" disabled={saving} onClick={addReg}>
                {saving ? 'Saving.' : 'Add attendee'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CSS = `
.gx { --e:#123c2e; --e2:#1E5D4A; --g:#C9A35B; --iv:#F7F4EE; --ink:#2c2a26; --mut:#7d776c; --ln:#e7e1d6;
  font-family:'Inter',system-ui,sans-serif; color:var(--ink); max-width:1180px; }
.gx *,.gx *::before,.gx *::after { box-sizing:border-box; }
.gx h1,.gx h2,.gx h3 { font-family:'Cormorant Garamond',Georgia,serif; margin:0; }
.gx-head { margin-bottom:18px; }
.gx-kicker { font-size:10.5px; letter-spacing:1.4px; text-transform:uppercase; color:var(--g); font-weight:600; }
.gx-title { font-size:28px; color:var(--e); line-height:1.1; }
.gx-sub { font-size:13px; color:var(--mut); margin:4px 0 0; max-width:680px; line-height:1.5; }
.gx-bar { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
.gx-bar label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; flex:1 1 280px; }
.gx-bar input { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.gx-error { background:#fff3f1; border:1px solid #e7b7ab; color:#9a3a28; padding:10px 14px; border-radius:10px; font-size:13px; margin-bottom:14px; }
.gx-empty { padding:40px; text-align:center; color:var(--mut); border:1px dashed var(--ln); border-radius:14px; background:rgba(247,244,238,.55); }
.gx-tabs { display:flex; gap:8px; margin-bottom:16px; border-bottom:1px solid var(--ln); }
.gx-tabs button { font:inherit; font-size:13px; font-weight:600; color:var(--mut); background:none; border:0; border-bottom:2px solid transparent; padding:8px 4px; cursor:pointer; }
.gx-tabs button.on { color:var(--e); border-bottom-color:var(--g); }
.gx-scan { display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap; margin-bottom:10px; }
.gx-scan label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; flex:1 1 280px; }
.gx-scan input { font:inherit; font-size:13px; padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.gx-scanmsg { font-size:12.5px; color:var(--e); background:rgba(30,93,74,.1); padding:8px 12px; border-radius:9px; margin-bottom:14px; }
.gx-list { display:flex; flex-direction:column; gap:10px; }
.gx-card { display:flex; justify-content:space-between; align-items:center; gap:14px; background:#fff; border:1px solid var(--ln); border-radius:14px; padding:12px 16px; flex-wrap:wrap; }
.gx-card-main { display:flex; align-items:center; gap:12px; flex-wrap:wrap; min-width:0; }
.gx-who { display:flex; flex-direction:column; gap:1px; }
.gx-who strong { font-size:13.5px; color:var(--ink); }
.gx-who span { font-size:12px; color:var(--mut); }
.gx-ticket { font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; background:rgba(201,163,91,.2); color:#7a5a17; padding:2px 10px; border-radius:999px; }
.gx-rsvp { font-size:11px; font-weight:700; padding:2px 10px; border-radius:999px; background:rgba(125,119,108,.14); color:var(--mut); }
.gx-r-going { background:rgba(30,93,74,.16); color:var(--e2); }
.gx-r-not_going { background:#fff3f1; color:#9a3a28; }
.gx-in { font-size:11px; font-weight:700; background:var(--e); color:#fff; padding:2px 10px; border-radius:999px; }
.gx-qr { font-size:11px; color:var(--mut); background:var(--iv); padding:2px 8px; border-radius:6px; }
.gx-actions { display:flex; gap:8px; align-items:center; }
.gx-actions select { font:inherit; font-size:12.5px; padding:7px 9px; border:1px solid var(--ln); border-radius:9px; background:#fff; color:var(--ink); }
.gx-info { display:flex; flex-direction:column; gap:12px; }
.gx-info label,.gx-full { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.gx-info input,.gx-info textarea { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.gx-info textarea { min-height:80px; resize:vertical; }
.gx-info-actions { display:flex; justify-content:flex-end; }
.gx-updates { background:#fff; border:1px solid var(--ln); border-radius:14px; padding:14px 18px; }
.gx-updates strong { font-size:11px; letter-spacing:.5px; text-transform:uppercase; color:var(--mut); }
.gx-updates ul { margin:8px 0 0; padding-left:18px; }
.gx-updates li { font-size:12.5px; color:var(--ink); margin-bottom:4px; line-height:1.5; }
.gx-update-at { display:block; font-size:11px; color:var(--mut); }
.gx-btn { background:var(--e); color:#fff; border:0; border-radius:9px; font:inherit; font-size:12.5px; font-weight:600; padding:9px 16px; cursor:pointer; }
.gx-btn:hover { background:var(--e2); }
.gx-btn.ghost { background:transparent; color:var(--e); border:1px solid var(--ln); }
.gx-btn.ghost:hover { border-color:var(--e); }
.gx-btn.danger { background:transparent; color:#9a3a28; border:1px solid #e7b7ab; }
.gx-btn:disabled { opacity:.6; cursor:default; }
.gx-modal { position:fixed; inset:0; background:rgba(18,60,46,.4); display:grid; place-items:center; padding:20px; z-index:50; }
.gx-modal-card { background:#fff; border-radius:16px; padding:24px; width:100%; max-width:560px; max-height:90vh; overflow:auto; }
.gx-modal-card h2 { font-size:24px; color:var(--e); margin-bottom:16px; }
.gx-form { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.gx-form .gx-full { grid-column:1 / -1; }
.gx-form label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--mut); font-weight:600; }
.gx-form input,.gx-form select { font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border:1px solid var(--ln); border-radius:9px; background:#fff; }
.gx-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
@media (max-width:680px){ .gx-form { grid-template-columns:1fr; } .gx-card { flex-direction:column; align-items:flex-start; } }
`;
