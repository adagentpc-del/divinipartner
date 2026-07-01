import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiGet, apiSend, apiBlob } from '../../lib/api';
import AddToCalendar from '../../components/AddToCalendar';

/**
 * Event day mode (route /events/:id/day). A simplified, large-touch-target
 * phone view a planner, vendor or venue uses on the day of an event. Big
 * buttons, minimal chrome, glanceable. It surfaces the live now / next
 * itinerary, today's tasks with big check-off buttons, key contacts as
 * tap-to-call / email rows, and large event status action buttons. Every
 * piece is built from real event data with graceful empty states. A manual
 * Refresh button gives a pull-to-refresh feel without any fabrication.
 */

type EventRow = {
  id: string;
  name: string;
  type: string | null;
  venue_id: string | null;
  date_time: string | null;
  guest_count: number | null;
  status: string | null;
};

type StatusMeta = { key: string; label: string };

type DerivedItem = {
  key: string;
  title: string;
  description: string | null;
  category: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  owner_role: string;
  owner_label: string | null;
  source: string;
  status: string;
};
type BuiltItinerary = {
  event: { id: string; name: string; date_time: string | null; guest_count: number | null };
  generated_at: string;
  items: DerivedItem[];
  categories: { key: string; label: string }[];
};

type Task = {
  id: string;
  name: string | null;
  category: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  milestone: boolean | null;
  assigned_role: string | null;
};

type EventVendor = {
  id: string;
  organization_id: string;
  vendor_id: string | null;
  role: string | null;
  status: string | null;
  // Optional richer contact fields, surfaced only when the API provides them.
  org_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type Guest = {
  id: string;
  name: string | null;
  rsvp_status: string | null;
  party_size: number | null;
  vip: boolean | null;
  checked_in: boolean | null;
};

type Headcount = {
  total: number;
  confirmed: number;
  checked_in: number;
};

function fmtTime(v: string | null): string {
  if (!v) return 'TBD';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? 'TBD'
    : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtRange(a: string | null, b: string | null): string {
  if (!a) return 'Time to be set';
  return b && b !== a ? `${fmtTime(a)} to ${fmtTime(b)}` : fmtTime(a);
}
function fmtDay(v: string | null): string {
  if (!v) return 'Date to be set';
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? 'Date to be set'
    : d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}
function isToday(v: string | null): boolean {
  if (!v) return false;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

export default function EventDayMode() {
  const { id = '' } = useParams();
  const nav = useNavigate();

  const [ev, setEv] = useState<EventRow | null>(null);
  const [statuses, setStatuses] = useState<StatusMeta[]>([]);
  const [itinerary, setItinerary] = useState<BuiltItinerary | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<EventVendor[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [headcount, setHeadcount] = useState<Headcount | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [icsBusy, setIcsBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [e, meta, it, tk, vendors, gl, hc] = await Promise.all([
        apiGet<{ event: EventRow }>(`/events/${id}`),
        apiGet<{ statuses: StatusMeta[] }>(`/events/meta`).catch(() => ({ statuses: [] })),
        apiGet<{ itinerary: BuiltItinerary }>(`/itinerary/event/${id}/build`).catch(() => null),
        apiGet<{ tasks: Task[] }>(`/tasks/event/${id}`).catch(() => ({ tasks: [] })),
        apiGet<{ vendors: EventVendor[] }>(`/events/${id}/vendors`).catch(() => ({ vendors: [] })),
        apiGet<{ guests: Guest[] }>(`/guests/event/${id}`).catch(() => ({ guests: [] })),
        apiGet<{ headcount: Headcount }>(`/guests/event/${id}/headcount`).catch(() => null),
      ]);
      setEv(e.event);
      setStatuses(meta.statuses);
      setItinerary(it ? it.itinerary : null);
      setTasks(tk.tasks);
      setContacts(vendors.vendors);
      setGuests(gl.guests);
      setHeadcount(hc ? hc.headcount : null);
      setNow(Date.now());
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
      setLoadedOnce(true);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the now / next clock ticking so highlights stay live.
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  async function toggleTask(t: Task) {
    const next = t.status === 'done' ? 'todo' : 'done';
    // Optimistic flip so the big button feels instant on a phone.
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      await apiSend('POST', `/tasks/${t.id}/status`, { status: next });
    } catch (e) {
      setErr((e as Error).message);
      setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
    }
  }

  async function changeStatus(status: string) {
    setStatusBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ event: EventRow }>('POST', `/events/${id}/status`, { status });
      setEv(r.event);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setStatusBusy(false);
    }
  }

  async function toggleCheckIn(g: Guest) {
    const next = !g.checked_in;
    // Optimistic flip + headcount bump so the tap feels instant.
    setGuests((cur) => cur.map((x) => (x.id === g.id ? { ...x, checked_in: next } : x)));
    setHeadcount((cur) =>
      cur ? { ...cur, checked_in: Math.max(0, cur.checked_in + (next ? 1 : -1)) } : cur,
    );
    try {
      await apiSend('PATCH', `/guests/${g.id}/checkin`, { checked_in: next });
    } catch (e) {
      setErr((e as Error).message);
      setGuests((cur) => cur.map((x) => (x.id === g.id ? { ...x, checked_in: g.checked_in } : x)));
      setHeadcount((cur) =>
        cur ? { ...cur, checked_in: Math.max(0, cur.checked_in + (next ? -1 : 1)) } : cur,
      );
    }
  }

  async function downloadIcs() {
    setIcsBusy(true);
    setErr(null);
    try {
      const blob = await apiBlob(`/events/${id}/ics`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(ev?.name ?? 'event').replace(/[^a-zA-Z0-9_-]/g, '') || 'event'}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setIcsBusy(false);
    }
  }

  // Split the itinerary into past / current / upcoming around the live clock.
  const timeline = useMemo(() => {
    const items = (itinerary?.items ?? [])
      .filter((i) => i.start_time)
      .slice()
      .sort((a, b) => new Date(a.start_time as string).getTime() - new Date(b.start_time as string).getTime());

    let currentIdx = -1;
    for (let i = 0; i < items.length; i += 1) {
      const start = new Date(items[i].start_time as string).getTime();
      const end = items[i].end_time ? new Date(items[i].end_time as string).getTime() : start;
      if (now >= start && now <= Math.max(end, start)) {
        currentIdx = i;
        break;
      }
    }
    if (currentIdx === -1) {
      // No item spans right now: treat the next future item as the focus.
      const nextIdx = items.findIndex((i) => new Date(i.start_time as string).getTime() > now);
      currentIdx = nextIdx;
    }

    const current = currentIdx >= 0 ? items[currentIdx] : null;
    const upcoming = currentIdx >= 0 ? items.slice(currentIdx + 1, currentIdx + 4) : items.slice(0, 3);
    const noTime = (itinerary?.items ?? []).filter((i) => !i.start_time);
    return { items, current, upcoming, noTime, hasAny: (itinerary?.items ?? []).length > 0 };
  }, [itinerary, now]);

  // Today's tasks first, then any task with no due date, then the rest.
  const dayTasks = useMemo(() => {
    const today = tasks.filter((t) => isToday(t.due_date));
    const undated = tasks.filter((t) => !t.due_date);
    const list = today.length > 0 ? today : [...today, ...undated];
    return list.length > 0 ? list : tasks.slice(0, 8);
  }, [tasks]);

  const tasksDone = dayTasks.filter((t) => t.status === 'done').length;

  const venueLine = useMemo(() => {
    const loc = (itinerary?.items ?? []).find((i) => i.location)?.location;
    if (loc) return loc;
    if (ev?.venue_id) return 'Venue on file';
    return 'Venue to be confirmed';
  }, [itinerary, ev]);

  const currentStatusLabel =
    statuses.find((s) => s.key === ev?.status)?.label ?? ev?.status?.replace(/_/g, ' ') ?? 'Inquiry';

  // Headcount: prefer the server aggregate, fall back to the loaded guest list
  // so the count stays correct after optimistic check-in toggles.
  const liveHead = useMemo<Headcount>(() => {
    const fromList: Headcount = {
      total: guests.length,
      confirmed: guests.filter((g) => g.rsvp_status === 'confirmed').length,
      checked_in: guests.filter((g) => g.checked_in).length,
    };
    if (!headcount) return fromList;
    // Keep the live checked_in (reflects optimistic toggles) over the snapshot.
    return { ...headcount, checked_in: fromList.checked_in };
  }, [guests, headcount]);

  // Guests sorted for the day-of list: not-yet-checked-in first, VIPs ahead.
  const guestList = useMemo(() => {
    return guests.slice().sort((a, b) => {
      if (!!a.checked_in !== !!b.checked_in) return a.checked_in ? 1 : -1;
      if (!!a.vip !== !!b.vip) return a.vip ? -1 : 1;
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  }, [guests]);

  return (
    <div className="dm">
      <style>{DM_CSS}</style>

      <header className="dm-top">
        <button type="button" className="dm-exit" onClick={() => nav(`/events/${id}`)}>
          Exit
        </button>
        <span className="dm-mode">Event day mode</span>
        <button type="button" className="dm-refresh" onClick={() => void load()} disabled={busy}>
          {busy ? 'Refreshing' : 'Refresh'}
        </button>
      </header>

      {err ? <p className="dm-error">{err}</p> : null}

      {!loadedOnce && !ev ? (
        <p className="dm-loading">Loading event day mode...</p>
      ) : (
        <main className="dm-main">
          <section className="dm-hero">
            <div className="dm-kicker">{isToday(ev?.date_time ?? null) ? 'Today' : 'Event'}</div>
            <h1 className="dm-title">{ev?.name ?? 'Event'}</h1>
            <div className="dm-heroline">{fmtDay(ev?.date_time ?? null)}</div>
            <div className="dm-heroline dm-venue">{venueLine}</div>
            <div className="dm-herostat">
              <span className="dm-pill">{currentStatusLabel}</span>
              {ev?.guest_count != null ? <span className="dm-pill alt">{ev.guest_count} guests</span> : null}
            </div>
            <AddToCalendar
              title={ev?.name ?? 'Event'}
              start={ev?.date_time}
              location={venueLine}
              details={`${ev?.name ?? 'Event'} on Divini Partners. ${ev?.guest_count != null ? `${ev.guest_count} guests. ` : ''}View: ${typeof window !== 'undefined' ? window.location.origin : ''}/events/${id}`}
              onIcs={() => void downloadIcs()}
              icsBusy={icsBusy}
            />
          </section>

          {/* Now / next itinerary */}
          <section className="dm-block">
            <h2 className="dm-blockhead">Now and next</h2>
            {!timeline.hasAny ? (
              <div className="dm-empty">No itinerary yet. Set the event date and accept quotes to build the schedule.</div>
            ) : !timeline.current && timeline.noTime.length === 0 ? (
              <div className="dm-empty">The scheduled portion of the day has wrapped. Nothing more on the clock.</div>
            ) : (
              <>
                {timeline.current ? (
                  <div className="dm-now">
                    <div className="dm-nowtag">
                      {now >= new Date(timeline.current.start_time as string).getTime() ? 'Happening now' : 'Up next'}
                    </div>
                    <div className="dm-nowtime">{fmtRange(timeline.current.start_time, timeline.current.end_time)}</div>
                    <div className="dm-nowtitle">{timeline.current.title}</div>
                    {timeline.current.location ? <div className="dm-nowmeta">{timeline.current.location}</div> : null}
                    {timeline.current.owner_label ? (
                      <div className="dm-nowmeta dm-nowowner">{timeline.current.owner_label}</div>
                    ) : null}
                  </div>
                ) : null}

                {timeline.upcoming.length > 0 ? (
                  <ul className="dm-upnext">
                    {timeline.upcoming.map((i) => (
                      <li key={i.key} className="dm-uprow">
                        <span className="dm-uptime">{fmtTime(i.start_time)}</span>
                        <span className="dm-uptitle">{i.title}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {timeline.noTime.length > 0 ? (
                  <div className="dm-untimed">
                    <span className="dm-untimedlabel">No set time</span>
                    {timeline.noTime.slice(0, 4).map((i) => (
                      <span key={i.key} className="dm-untimeditem">{i.title}</span>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* Today's tasks */}
          <section className="dm-block">
            <h2 className="dm-blockhead">
              Tasks
              {dayTasks.length > 0 ? <span className="dm-count">{tasksDone}/{dayTasks.length} done</span> : null}
            </h2>
            {dayTasks.length === 0 ? (
              <div className="dm-empty">No tasks to action right now. You are clear.</div>
            ) : (
              <ul className="dm-tasks">
                {dayTasks.map((t) => {
                  const done = t.status === 'done';
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`dm-task${done ? ' is-done' : ''}`}
                        onClick={() => void toggleTask(t)}
                        aria-pressed={done}
                      >
                        <span className="dm-checkbox" aria-hidden="true">{done ? '✓' : ''}</span>
                        <span className="dm-taskbody">
                          <span className="dm-taskname">{t.name ?? 'Untitled task'}</span>
                          <span className="dm-taskmeta">
                            {t.priority ? <span className={`dm-pri pri-${t.priority}`}>{t.priority}</span> : null}
                            {t.milestone ? <span className="dm-ms">Milestone</span> : null}
                            {t.assigned_role ? <span className="dm-trole">{t.assigned_role}</span> : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Key contacts */}
          <section className="dm-block">
            <h2 className="dm-blockhead">Key contacts</h2>
            {contacts.length === 0 ? (
              <div className="dm-empty">No partners attached to this event yet.</div>
            ) : (
              <ul className="dm-contacts">
                {contacts.map((c) => {
                  const label = c.contact_name || c.org_name || c.role || 'Partner';
                  const sub = [c.role, c.status].filter(Boolean).join(' · ');
                  return (
                    <li key={c.id} className="dm-contact">
                      <div className="dm-contactinfo">
                        <span className="dm-contactname">{label}</span>
                        {sub ? <span className="dm-contactsub">{sub}</span> : null}
                      </div>
                      <div className="dm-contactacts">
                        {c.phone ? (
                          <a className="dm-cact" href={`tel:${c.phone}`}>Call</a>
                        ) : null}
                        {c.email ? (
                          <a className="dm-cact" href={`mailto:${c.email}`}>Email</a>
                        ) : null}
                        {!c.phone && !c.email ? <span className="dm-cactnone">No contact on file</span> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Guest check-in + live headcount */}
          <section className="dm-block">
            <h2 className="dm-blockhead">
              Guest check-in
              <span className="dm-count">
                {liveHead.checked_in} of {liveHead.total} checked in
              </span>
            </h2>
            <div className="dm-headstats">
              <div className="dm-headstat">
                <span className="dm-headnum">{liveHead.checked_in}</span>
                <span className="dm-headlbl">Checked in</span>
              </div>
              <div className="dm-headstat">
                <span className="dm-headnum">{liveHead.confirmed}</span>
                <span className="dm-headlbl">Confirmed</span>
              </div>
              <div className="dm-headstat">
                <span className="dm-headnum">{liveHead.total}</span>
                <span className="dm-headlbl">On the list</span>
              </div>
            </div>
            {guestList.length === 0 ? (
              <div className="dm-empty">No guests on the list yet. Add guests from the event guest list.</div>
            ) : (
              <ul className="dm-tasks dm-guests">
                {guestList.map((g) => {
                  const inHere = !!g.checked_in;
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        className={`dm-task${inHere ? ' is-done' : ''}`}
                        onClick={() => void toggleCheckIn(g)}
                        aria-pressed={inHere}
                      >
                        <span className="dm-checkbox" aria-hidden="true">{inHere ? '✓' : ''}</span>
                        <span className="dm-taskbody">
                          <span className="dm-taskname">{g.name ?? 'Guest'}</span>
                          <span className="dm-taskmeta">
                            {g.vip ? <span className="dm-ms">VIP</span> : null}
                            {g.party_size && g.party_size > 1 ? (
                              <span className="dm-trole">party of {g.party_size}</span>
                            ) : null}
                            {g.rsvp_status ? <span className="dm-trole">{g.rsvp_status}</span> : null}
                          </span>
                        </span>
                        <span className="dm-checkstate">{inHere ? 'Here' : 'Tap to check in'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Status actions */}
          {statuses.length > 0 ? (
            <section className="dm-block">
              <h2 className="dm-blockhead">Move event status</h2>
              <div className="dm-statusgrid">
                {statuses.map((s) => {
                  const active = s.key === ev?.status;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`dm-statusbtn${active ? ' is-active' : ''}`}
                      disabled={statusBusy || active}
                      onClick={() => void changeStatus(s.key)}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          <p className="dm-foot">Tap Refresh to pull the latest schedule, tasks and status.</p>
        </main>
      )}
    </div>
  );
}

const DM_CSS = `
.dm {
  --dp-emerald: #123c2e; --dp-emerald-2: #1E5D4A; --dp-gold: #C9A35B;
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #7d776c; --dp-line: #e7e1d6;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  color: var(--dp-ink); background: var(--dp-emerald);
  min-height: 100vh; min-height: 100dvh;
}
.dm *, .dm *::before, .dm *::after { box-sizing: border-box; }
.dm h1, .dm h2 { font-family: 'Cormorant Garamond', Georgia, serif; font-weight: 600; margin: 0; }

.dm-top {
  position: sticky; top: 0; z-index: 5;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  background: var(--dp-emerald); color: #fff;
  padding: calc(env(safe-area-inset-top) + 10px) calc(env(safe-area-inset-right) + 14px) 10px calc(env(safe-area-inset-left) + 14px);
  border-bottom: 1px solid rgba(255,255,255,.12);
}
.dm-mode { font-size: 11px; letter-spacing: 1.4px; text-transform: uppercase; color: var(--dp-gold); font-weight: 700; }
.dm-exit, .dm-refresh {
  min-height: 40px; padding: 9px 16px; border-radius: 10px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
}
.dm-exit { background: transparent; border: 1px solid rgba(255,255,255,.35); color: #fff; }
.dm-refresh { background: var(--dp-gold); border: 0; color: var(--dp-emerald); }
.dm-refresh:disabled { opacity: .6; }

.dm-loading { color: #fff; text-align: center; padding: 60px 20px; font-size: 15px; opacity: .85; }
.dm-error {
  margin: 12px calc(env(safe-area-inset-right) + 14px) 0 calc(env(safe-area-inset-left) + 14px);
  background: #f6eaea; color: #8a3a3a; border: 1px solid #e2caca; border-radius: 10px; padding: 11px 14px; font-size: 13.5px;
}

.dm-main {
  padding: 16px calc(env(safe-area-inset-right) + 14px) calc(env(safe-area-inset-bottom) + 40px) calc(env(safe-area-inset-left) + 14px);
  display: flex; flex-direction: column; gap: 16px; max-width: 640px; margin: 0 auto;
}

.dm-hero { color: #fff; padding: 8px 2px 4px; }
.dm-kicker { font-size: 12px; letter-spacing: 1.6px; text-transform: uppercase; color: var(--dp-gold); font-weight: 700; }
.dm-title { font-size: 34px; line-height: 1.05; margin: 4px 0 8px; }
.dm-heroline { font-size: 15.5px; color: rgba(255,255,255,.9); line-height: 1.4; }
.dm-venue { color: rgba(255,255,255,.7); }
.dm-herostat { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.dm-pill {
  font-size: 12.5px; font-weight: 600; text-transform: capitalize; color: var(--dp-emerald);
  background: var(--dp-gold); padding: 6px 13px; border-radius: 999px;
}
.dm-pill.alt { background: rgba(255,255,255,.16); color: #fff; }

.dm-block { background: var(--dp-ivory); border-radius: 18px; padding: 18px 16px; }
.dm-blockhead {
  font-size: 21px; color: var(--dp-emerald); margin-bottom: 12px;
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
}
.dm-count { font-family: 'Inter', sans-serif; font-size: 12px; font-weight: 600; color: var(--dp-muted); }
.dm-empty {
  border: 1px dashed var(--dp-line); border-radius: 12px; padding: 18px;
  font-size: 13.5px; color: var(--dp-muted); line-height: 1.55; background: #fff;
}

.dm-now {
  background: var(--dp-emerald); color: #fff; border-radius: 14px; padding: 16px; margin-bottom: 12px;
  border: 1px solid var(--dp-emerald-2);
}
.dm-nowtag { font-size: 11px; letter-spacing: 1.3px; text-transform: uppercase; color: var(--dp-gold); font-weight: 700; }
.dm-nowtime { font-size: 16px; font-weight: 600; margin-top: 6px; }
.dm-nowtitle { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 26px; line-height: 1.1; margin-top: 4px; }
.dm-nowmeta { font-size: 13px; color: rgba(255,255,255,.78); margin-top: 6px; }
.dm-nowowner { color: var(--dp-gold); }

.dm-upnext { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.dm-uprow { display: flex; align-items: baseline; gap: 12px; padding: 12px 6px; border-bottom: 1px solid var(--dp-line); }
.dm-uprow:last-child { border-bottom: 0; }
.dm-uptime { flex: 0 0 78px; font-size: 14px; font-weight: 600; color: var(--dp-emerald); }
.dm-uptitle { font-size: 14.5px; color: var(--dp-ink); }

.dm-untimed { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 12px; }
.dm-untimedlabel { font-size: 10.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--dp-muted); }
.dm-untimeditem { font-size: 12.5px; color: var(--dp-emerald); background: #fff; border: 1px solid var(--dp-line); border-radius: 999px; padding: 4px 11px; }

.dm-tasks, .dm-contacts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.dm-task {
  width: 100%; display: flex; align-items: center; gap: 14px; text-align: left;
  min-height: 60px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--dp-line);
  background: #fff; color: var(--dp-ink); font: inherit; cursor: pointer; transition: background .12s ease, border-color .12s ease;
}
.dm-task:active { background: rgba(18,60,46,.05); }
.dm-task.is-done { background: rgba(30,93,74,.08); border-color: rgba(30,93,74,.3); }
.dm-checkbox {
  flex: 0 0 auto; width: 34px; height: 34px; border-radius: 10px; border: 2px solid var(--dp-emerald-2);
  display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 700; color: #fff;
}
.dm-task.is-done .dm-checkbox { background: var(--dp-emerald-2); }
.dm-taskbody { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.dm-taskname { font-size: 15.5px; font-weight: 500; line-height: 1.3; }
.dm-task.is-done .dm-taskname { text-decoration: line-through; color: var(--dp-muted); }
.dm-taskmeta { display: flex; flex-wrap: wrap; gap: 7px; align-items: center; }
.dm-pri { font-size: 10.5px; font-weight: 600; text-transform: capitalize; padding: 2px 8px; border-radius: 999px; }
.pri-low { background: #eef2ef; color: #5a6b62; }
.pri-medium { background: #eaf0ee; color: #1E5D4A; }
.pri-high { background: rgba(201,163,91,.22); color: #9a7e3e; }
.pri-urgent { background: #f6eaea; color: #8a3a3a; }
.dm-ms { font-size: 9.5px; font-weight: 700; letter-spacing: .5px; color: var(--dp-emerald); background: rgba(201,163,91,.3); border-radius: 5px; padding: 2px 6px; }
.dm-trole { font-size: 11px; color: #9a8a5e; text-transform: capitalize; }

.dm-contact {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  min-height: 60px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--dp-line); background: #fff;
}
.dm-contactinfo { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dm-contactname { font-size: 15px; font-weight: 600; color: var(--dp-ink); }
.dm-contactsub { font-size: 12px; color: var(--dp-muted); text-transform: capitalize; }
.dm-contactacts { display: flex; gap: 8px; flex: 0 0 auto; }
.dm-cact {
  display: inline-flex; align-items: center; justify-content: center; min-height: 44px; min-width: 64px;
  padding: 0 16px; border-radius: 11px; background: var(--dp-emerald); color: #fff; text-decoration: none;
  font-size: 14px; font-weight: 600;
}
.dm-cact:active { background: var(--dp-emerald-2); }
.dm-cactnone { font-size: 11.5px; color: var(--dp-muted); align-self: center; }

.dm-statusgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.dm-statusbtn {
  min-height: 56px; padding: 12px; border-radius: 13px; border: 1px solid var(--dp-line); background: #fff;
  color: var(--dp-emerald); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; line-height: 1.25;
}
.dm-statusbtn:active { background: rgba(18,60,46,.05); }
.dm-statusbtn.is-active { background: var(--dp-emerald); color: #fff; border-color: var(--dp-emerald); }
.dm-statusbtn:disabled { cursor: default; }
.dm-statusbtn.is-active:disabled { opacity: 1; }
.dm-statusbtn:disabled:not(.is-active) { opacity: .55; }

.dm-ics {
  margin-top: 14px; min-height: 48px; width: 100%; padding: 12px 16px; border-radius: 12px;
  background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.3); color: #fff;
  font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
}
.dm-ics:active { background: rgba(255,255,255,.2); }
.dm-ics:disabled { opacity: .6; cursor: default; }

.dm-headstats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
.dm-headstat {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  background: #fff; border: 1px solid var(--dp-line); border-radius: 12px; padding: 12px 8px;
}
.dm-headnum { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; font-weight: 600; color: var(--dp-emerald); line-height: 1; }
.dm-headlbl { font-size: 10.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--dp-muted); }

.dm-guests .dm-task { gap: 12px; }
.dm-checkstate { margin-left: auto; flex: 0 0 auto; font-size: 11.5px; font-weight: 600; color: var(--dp-muted); text-align: right; }
.dm-task.is-done .dm-checkstate { color: var(--dp-emerald-2); }

.dm-foot { text-align: center; font-size: 12px; color: rgba(255,255,255,.6); margin: 4px 0 0; }

@media (min-width: 560px) {
  .dm-statusgrid { grid-template-columns: repeat(3, 1fr); }
}
`;
