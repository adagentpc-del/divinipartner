import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiSend } from '../lib/api';

/**
 * Phase 2 - Nonprofit Volunteer Management. A nonprofit manages its volunteer
 * roster for a fundraising event: registration (name, email, phone, emergency
 * contact), role + shift assignment, day-of check-in, and a per-volunteer task
 * checklist. An optional ?event=<fundraisingEventId> scopes the roster to a
 * single fundraising event (remembered in localStorage). All reads and writes
 * go through the org-scoped, IDOR-safe /volunteer API.
 */

type Volunteer = {
  id: string;
  fundraising_event_id?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  emergency_contact?: string | null;
  role?: string | null;
  shift?: string | null;
  status?: string | null;
  checked_in_at?: string | null;
  created_at?: string;
};

type VolunteerTask = {
  id: string;
  volunteer_id?: string | null;
  label?: string | null;
  status?: string | null;
  created_at?: string;
};

const EVENT_KEY = 'dp.vol.eventId';

type RegState = {
  name: string;
  email: string;
  phone: string;
  emergency_contact: string;
};

const EMPTY_REG: RegState = { name: '', email: '', phone: '', emergency_contact: '' };

function statusLabel(s?: string | null): string {
  if (!s) return 'registered';
  return s.replace(/_/g, ' ');
}

export default function VolunteerManager() {
  const [params, setParams] = useSearchParams();
  const initialEvent = params.get('event') || localStorage.getItem(EVENT_KEY) || '';
  const [eventId, setEventId] = useState<string>(initialEvent);
  const [eventInput, setEventInput] = useState<string>(initialEvent);

  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [reg, setReg] = useState<RegState>({ ...EMPTY_REG });

  // Per-volunteer task drawers: which volunteer is expanded + its loaded tasks.
  const [openTasks, setOpenTasks] = useState<string | null>(null);
  const [tasks, setTasks] = useState<VolunteerTask[]>([]);
  const [taskLabel, setTaskLabel] = useState('');

  // Per-volunteer assignment inputs (role + shift) keyed by volunteer id.
  const [assign, setAssign] = useState<Record<string, { role: string; shift: string }>>({});

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const path = eventId ? `/volunteer?event=${encodeURIComponent(eventId)}` : '/volunteer';
      const r = await apiGet<{ volunteers: Volunteer[] }>(path);
      setVolunteers(r.volunteers ?? []);
    } catch (e) {
      setErr((e as Error).message);
      setVolunteers([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [eventId]);

  function applyEvent() {
    const id = eventInput.trim();
    setEventId(id);
    if (id) {
      localStorage.setItem(EVENT_KEY, id);
      setParams({ event: id });
    } else {
      localStorage.removeItem(EVENT_KEY);
      setParams({});
    }
  }

  async function register() {
    if (!reg.name.trim()) { setErr('Volunteer name is required'); return; }
    setBusy(true);
    setErr(null);
    const body: Record<string, unknown> = {
      name: reg.name.trim(),
      email: reg.email.trim() || null,
      phone: reg.phone.trim() || null,
      emergency_contact: reg.emergency_contact.trim() || null,
    };
    if (eventId) body.fundraising_event_id = eventId;
    try {
      await apiSend('POST', '/volunteer', body);
      setReg({ ...EMPTY_REG });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignment(v: Volunteer) {
    const a = assign[v.id] ?? { role: v.role ?? '', shift: v.shift ?? '' };
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', `/volunteer/${v.id}/assign`, {
        role: a.role.trim() || null,
        shift: a.shift.trim() || null,
      });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function checkIn(v: Volunteer) {
    setBusy(true);
    setErr(null);
    try {
      await apiSend('POST', `/volunteer/${v.id}/check-in`, {});
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(v: Volunteer) {
    if (!window.confirm(`Remove ${v.name} from the roster?`)) return;
    setBusy(true);
    try {
      await apiSend('DELETE', `/volunteer/${v.id}`);
      if (openTasks === v.id) setOpenTasks(null);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleTasks(v: Volunteer) {
    if (openTasks === v.id) { setOpenTasks(null); return; }
    setOpenTasks(v.id);
    setTasks([]);
    setTaskLabel('');
    try {
      const r = await apiGet<{ tasks: VolunteerTask[] }>(`/volunteer/${v.id}/tasks`);
      setTasks(r.tasks ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function addTask(v: Volunteer) {
    if (!taskLabel.trim()) return;
    setBusy(true);
    try {
      await apiSend('POST', `/volunteer/${v.id}/tasks`, { label: taskLabel.trim() });
      setTaskLabel('');
      const r = await apiGet<{ tasks: VolunteerTask[] }>(`/volunteer/${v.id}/tasks`);
      setTasks(r.tasks ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(v: Volunteer, t: VolunteerTask) {
    const next = t.status === 'done' ? 'open' : 'done';
    setBusy(true);
    try {
      await apiSend('PATCH', `/volunteer/tasks/${t.id}`, { status: next });
      const r = await apiGet<{ tasks: VolunteerTask[] }>(`/volunteer/${v.id}/tasks`);
      setTasks(r.tasks ?? []);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendShiftReminders() {
    setBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ candidates: number; sent: number }>(
        'POST',
        '/volunteer/shift-reminders',
        eventId ? { event: eventId } : {},
      );
      window.alert(`Shift reminders sent to ${r.sent} of ${r.candidates} volunteer(s) with a shift.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Volunteer Manager</h1>
          <div className="sub">Register, assign, check in, and task your event volunteers</div>
        </div>
        <button className="btn" onClick={sendShiftReminders} disabled={busy || volunteers.length === 0}>
          Send shift reminders
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ flex: '1 1 280px' }}>
            <div className="note" style={{ marginBottom: 6 }}>Fundraising event ID (optional)</div>
            <input
              value={eventInput}
              onChange={(e) => setEventInput(e.target.value)}
              placeholder="Paste a fundraising event id to scope the roster"
              style={{ width: '100%' }}
            />
          </label>
          <button className="btn" onClick={applyEvent}>Load roster</button>
        </div>
        <p className="note" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          Leave the event id blank to manage your organization's full volunteer roster, or
          paste a fundraising event id to focus on the volunteers helping run that event.
        </p>
      </div>

      {err && (
        <div className="card" style={{ borderColor: '#c0392b', color: '#c0392b', marginBottom: 16 }}>{err}</div>
      )}

      {/* Registration form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="sectitle">Register a volunteer</div>
        <div className="grid cards2" style={{ gap: 12 }}>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Name</div>
            <input value={reg.name} onChange={(e) => setReg({ ...reg, name: e.target.value })} style={{ width: '100%' }} placeholder="Jordan Rivera" />
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Email</div>
            <input value={reg.email} onChange={(e) => setReg({ ...reg, email: e.target.value })} style={{ width: '100%' }} placeholder="jordan@example.org" inputMode="email" />
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Phone</div>
            <input value={reg.phone} onChange={(e) => setReg({ ...reg, phone: e.target.value })} style={{ width: '100%' }} placeholder="(305) 555-0142" inputMode="tel" />
          </label>
          <label>
            <div className="note" style={{ marginBottom: 6 }}>Emergency contact</div>
            <input value={reg.emergency_contact} onChange={(e) => setReg({ ...reg, emergency_contact: e.target.value })} style={{ width: '100%' }} placeholder="Name and phone" />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn primary" onClick={register} disabled={busy}>{busy ? 'Saving...' : 'Add volunteer'}</button>
        </div>
      </div>

      {/* Roster */}
      {loading ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>Loading volunteers...</p></div>
      ) : volunteers.length === 0 ? (
        <div className="card"><p className="note" style={{ margin: 0 }}>No volunteers yet. Register your first volunteer above.</p></div>
      ) : (
        <div className="grid cards2">
          {volunteers.map((v) => {
            const a = assign[v.id] ?? { role: v.role ?? '', shift: v.shift ?? '' };
            return (
              <div className="card" key={v.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <h3 style={{ margin: 0 }}>{v.name}</h3>
                  <span className="note" style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>{statusLabel(v.status)}</span>
                </div>
                <div className="note" style={{ lineHeight: 1.7, marginTop: 6 }}>
                  {v.email && <div>Email: {v.email}</div>}
                  {v.phone && <div>Phone: {v.phone}</div>}
                  {v.emergency_contact && <div>Emergency: {v.emergency_contact}</div>}
                  {v.checked_in_at && <div>Checked in: {new Date(v.checked_in_at).toLocaleString()}</div>}
                </div>

                {/* Assignment */}
                <div className="grid cards2" style={{ gap: 8, marginTop: 12 }}>
                  <label>
                    <div className="note" style={{ marginBottom: 6 }}>Role</div>
                    <input
                      value={a.role}
                      onChange={(e) => setAssign({ ...assign, [v.id]: { ...a, role: e.target.value } })}
                      style={{ width: '100%' }}
                      placeholder="Registration desk"
                    />
                  </label>
                  <label>
                    <div className="note" style={{ marginBottom: 6 }}>Shift</div>
                    <input
                      value={a.shift}
                      onChange={(e) => setAssign({ ...assign, [v.id]: { ...a, shift: e.target.value } })}
                      style={{ width: '100%' }}
                      placeholder="Sat 4-7pm"
                    />
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <button className="btn" onClick={() => saveAssignment(v)} disabled={busy}>Save assignment</button>
                  <button className="btn" onClick={() => checkIn(v)} disabled={busy || v.status === 'checked_in'}>
                    {v.status === 'checked_in' ? 'Checked in' : 'Check in'}
                  </button>
                  <button className="btn" onClick={() => toggleTasks(v)} disabled={busy}>
                    {openTasks === v.id ? 'Hide tasks' : 'Tasks'}
                  </button>
                  <button className="btn" onClick={() => remove(v)} disabled={busy}>Remove</button>
                </div>

                {/* Task drawer */}
                {openTasks === v.id && (
                  <div style={{ marginTop: 12, borderTop: '1px solid rgba(0,0,0,.08)', paddingTop: 12 }}>
                    <div className="sectitle" style={{ marginBottom: 8 }}>Tasks</div>
                    {tasks.length === 0 ? (
                      <p className="note" style={{ margin: '0 0 10px' }}>No tasks yet for this volunteer.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {tasks.map((t) => (
                          <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={t.status === 'done'}
                              onChange={() => toggleTask(v, t)}
                              disabled={busy}
                            />
                            <span style={{ textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        value={taskLabel}
                        onChange={(e) => setTaskLabel(e.target.value)}
                        placeholder="Set up registration table"
                        style={{ flex: 1 }}
                        onKeyDown={(e) => { if (e.key === 'Enter') void addTask(v); }}
                      />
                      <button className="btn" onClick={() => addTask(v)} disabled={busy || !taskLabel.trim()}>Add task</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
