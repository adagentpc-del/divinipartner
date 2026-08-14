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

type SponsorActivation = {
  id: string;
  sponsor_org_id: string;
  label: string;
  status: string;
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

// --- Vendor arrival/delivery schedule (completion phase, Part 3) -----------
// The same Time/Vendor/Action/Location/Contact/Status rows the desktop
// packet's Vendor Schedule section and GET /itinerary/event/:id/vendor-
// schedule both already resolve -- role-scoped server-side (a vendor sees
// only their own org's rows), so this view never needs its own filtering.

type VendorScheduleRow = {
  start_time: string | null;
  end_time: string | null;
  vendor_org_id: string;
  vendor_name: string;
  action: string;
  category: string;
  location: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
};

// --- Check-in / check-out (completion phase, Part 7-8) ---------------------

type CheckInRow = {
  id: string;
  event_id: string;
  user_id: string;
  organization_id: string | null;
  role: string;
  assigned_location: string | null;
  source_device: string | null;
  notes: string | null;
  checked_in_at: string;
  checked_in_by: string | null;
  checked_out_at: string | null;
  checked_out_by: string | null;
  created_at: string;
};

// --- Final Event Schedule / Execution Packet (Part 14) ----------------------
// Deliberately NOT a compressed copy of the desktop packet: only the four
// things someone checks on their phone before/during the event -- final
// count, their own call time, their own location, and whether they still
// need to confirm receipt. Everything else (full Run of Show, vendor
// roster, floorplans) lives in the desktop packet / the PDF download below.

type PacketVersionSummary = { id: string; version: number; status: string; update_required_reason?: string | null };

type PacketProjectionLite = {
  audience: 'full' | 'venue' | 'vendor' | 'vendor_staff' | 'sponsor' | 'event_staff';
  event: {
    date_time: string | null;
    load_in_at: string | null;
    vendor_call_at: string | null;
    doors_at: string | null;
    timezone: string | null;
  };
  venue: {
    name: string | null;
    address: string | null;
    vendor_entrance: string | null;
    guest_entrance: string | null;
  };
  final_count: { version: number; count: number } | null;
  /** The viewer's own vendor's final quantities only -- null for
   *  non-vendor audiences (Part 9: "MY EVENT"'s final quantity line). */
  my_final_quantity: Array<{ scope: string; quantity: string; unit: string; discrepancy_status: string | null }> | null;
  generated_at: string;
};

type MyAcknowledgment = { acknowledged_at: string | null; method: string | null } | null;

type Floorplan = { id: string; name: string | null; file_url: string | null; is_primary: boolean | null };

/** Page kicker per audience (Part 9-10): "MY EVENT" for a vendor, "TODAY"
 *  for event staff / sponsor -- owner/planner/venue keep the existing
 *  Today/Event framing, since those two named views are specifically the
 *  vendor and staff mobile experiences the spec calls for, not a relabel
 *  of every role's view. */
function audienceKicker(audience: PacketProjectionLite['audience'] | undefined, fallback: string): string {
  if (audience === 'vendor' || audience === 'vendor_staff') return 'MY EVENT';
  if (audience === 'event_staff' || audience === 'sponsor') return 'TODAY';
  return fallback;
}

/** The itinerary system's coarser role vocabulary (client/venue/vendor/
 *  installer/planner/all) is also what tasks.assigned_role uses -- the
 *  same mapping packetProjection.ts's SCHEDULE_ROLE_FOR_AUDIENCE applies
 *  server-side, mirrored here so "my next task" filters consistently. */
function taskRoleForAudience(audience: PacketProjectionLite['audience'] | undefined): string | null {
  switch (audience) {
    case 'venue': return 'venue';
    case 'vendor':
    case 'vendor_staff': return 'vendor';
    default: return null;
  }
}

/**
 * "MY CALL TIME" and "MY LOCATION" personalized per the viewer's own packet
 * audience -- derived from real structured event/venue fields the viewer's
 * own projection already includes, never fabricated or filtered to a
 * specific vendor org (the itinerary system does not expose a per-org call
 * time yet, so this uses the field that is genuinely most relevant to that
 * audience instead of guessing).
 */
function myCallTimeAndLocation(p: PacketProjectionLite): { time: string | null; location: string | null } {
  switch (p.audience) {
    case 'venue':
      return { time: p.event.load_in_at, location: p.venue.address };
    case 'vendor':
    case 'vendor_staff':
      return { time: p.event.vendor_call_at ?? p.event.load_in_at, location: p.venue.vendor_entrance ?? p.venue.address };
    case 'sponsor':
    case 'event_staff':
      return { time: p.event.doors_at ?? p.event.date_time, location: p.venue.guest_entrance ?? p.venue.address };
    default:
      return { time: p.event.date_time, location: p.venue.address };
  }
}

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
  const [sponsorActivations, setSponsorActivations] = useState<SponsorActivation[]>([]);
  const [contacts, setContacts] = useState<EventVendor[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [headcount, setHeadcount] = useState<Headcount | null>(null);
  const [vendorSchedule, setVendorSchedule] = useState<VendorScheduleRow[]>([]);
  const [myCheckIn, setMyCheckIn] = useState<CheckInRow | null>(null);
  const [checkInBusy, setCheckInBusy] = useState(false);
  const [floorplans, setFloorplans] = useState<Floorplan[]>([]);
  const [now, setNow] = useState<number>(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [icsBusy, setIcsBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const [packetVersion, setPacketVersion] = useState<PacketVersionSummary | null>(null);
  const [packetProjection, setPacketProjection] = useState<PacketProjectionLite | null>(null);
  const [myAck, setMyAck] = useState<MyAcknowledgment>(null);
  const [ackBusy, setAckBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [regenBusy, setRegenBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const [e, meta, it, tk, vendors, gl, hc, versions, vs, mci, fp, spa] = await Promise.all([
        apiGet<{ event: EventRow }>(`/events/${id}`),
        apiGet<{ statuses: StatusMeta[] }>(`/events/meta`).catch(() => ({ statuses: [] })),
        apiGet<{ itinerary: BuiltItinerary }>(`/itinerary/event/${id}/build`).catch(() => null),
        apiGet<{ tasks: Task[] }>(`/tasks/event/${id}`).catch(() => ({ tasks: [] })),
        apiGet<{ vendors: EventVendor[] }>(`/events/${id}/vendors`).catch(() => ({ vendors: [] })),
        apiGet<{ guests: Guest[] }>(`/guests/event/${id}`).catch(() => ({ guests: [] })),
        apiGet<{ headcount: Headcount }>(`/guests/event/${id}/headcount`).catch(() => null),
        apiGet<{ versions: PacketVersionSummary[] }>(`/execution-packet/event/${id}`).catch(() => ({ versions: [] })),
        apiGet<{ schedule: VendorScheduleRow[] }>(`/itinerary/event/${id}/vendor-schedule`).catch(() => ({ schedule: [] })),
        apiGet<{ check_in: CheckInRow | null }>(`/check-ins/event/${id}/mine`).catch(() => ({ check_in: null })),
        apiGet<{ floorplans: Floorplan[] }>(`/seating/floorplans/event/${id}`).catch(() => ({ floorplans: [] })),
        apiGet<{ activations: SponsorActivation[] }>(`/event-sponsor-activation/event/${id}`).catch(() => ({ activations: [] })),
      ]);
      setEv(e.event);
      setStatuses(meta.statuses);
      setItinerary(it ? it.itinerary : null);
      setTasks(tk.tasks);
      setContacts(vendors.vendors);
      setGuests(gl.guests);
      setHeadcount(hc ? hc.headcount : null);
      setVendorSchedule(vs.schedule);
      setMyCheckIn(mci.check_in);
      setFloorplans(fp.floorplans);
      setSponsorActivations(spa.activations);
      setNow(Date.now());

      const latest = versions.versions[0] ?? null;
      setPacketVersion(latest);
      if (latest) {
        const [proj, ack] = await Promise.all([
          apiGet<{ packet: PacketProjectionLite }>(`/execution-packet/${latest.id}`).catch(() => null),
          apiGet<{ acknowledgment: MyAcknowledgment }>(`/execution-packet/${latest.id}/my-acknowledgment`).catch(() => ({ acknowledgment: null })),
        ]);
        setPacketProjection(proj ? proj.packet : null);
        setMyAck(ack.acknowledgment);
      } else {
        setPacketProjection(null);
        setMyAck(null);
      }
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

  // Sponsor activation self-check-off (Part 24): mirrors toggleTask's
  // optimistic-flip pattern. Only the sponsor's own org's items are ever
  // in `sponsorActivations` to begin with (server-side visibility,
  // lib/sponsorActivationVisibility.ts) so there is nothing to filter
  // client-side here.
  async function toggleActivation(a: SponsorActivation) {
    const next = a.status === 'complete' ? 'not_started' : 'complete';
    setSponsorActivations((cur) => cur.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
    try {
      await apiSend('PATCH', `/event-sponsor-activation/event/${id}/${a.id}`, { status: next });
    } catch (e) {
      setErr((e as Error).message);
      setSponsorActivations((cur) => cur.map((x) => (x.id === a.id ? { ...x, status: a.status } : x)));
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

  async function toggleMyCheckIn() {
    setCheckInBusy(true);
    setErr(null);
    try {
      const isOpen = !!myCheckIn && !myCheckIn.checked_out_at;
      const r = await apiSend<{ check_in: CheckInRow }>('POST', `/check-ins/event/${id}/${isOpen ? 'check-out' : 'check-in'}`);
      setMyCheckIn(r.check_in);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setCheckInBusy(false);
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

  async function confirmReceipt() {
    if (!packetVersion) return;
    setAckBusy(true);
    setErr(null);
    try {
      const r = await apiSend<{ acknowledgment: MyAcknowledgment }>(
        'POST',
        `/execution-packet/${packetVersion.id}/acknowledge`,
        { method: 'app' },
      );
      setMyAck(r.acknowledgment);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setAckBusy(false);
    }
  }

  async function downloadPacketPdf() {
    if (!packetVersion) return;
    setPdfBusy(true);
    setErr(null);
    try {
      const blob = await apiBlob(`/execution-packet/${packetVersion.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `final-event-schedule-v${packetVersion.version}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  }

  async function regeneratePacket() {
    setRegenBusy(true);
    setErr(null);
    try {
      await apiSend('POST', `/execution-packet/event/${id}/generate`);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRegenBusy(false);
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

  const myCallLocation = useMemo(
    () => (packetProjection ? myCallTimeAndLocation(packetProjection) : { time: null, location: null }),
    [packetProjection],
  );

  // "My next task" (Part 9-10): the next not-done task assigned to this
  // audience's itinerary role, or an unassigned task -- never another
  // role's task. Tasks with no assigned_role are visible to everyone
  // (they are genuinely unowned, not misattributed).
  const myNextTask = useMemo(() => {
    const myRole = taskRoleForAudience(packetProjection?.audience);
    const mine = tasks.filter((t) => t.status !== 'done' && (!t.assigned_role || t.assigned_role === myRole));
    return mine[0] ?? null;
  }, [tasks, packetProjection]);

  const primaryFloorplan = useMemo(
    () => floorplans.find((f) => f.is_primary) ?? floorplans[0] ?? null,
    [floorplans],
  );

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
            <div className="dm-kicker">
              {audienceKicker(packetProjection?.audience, isToday(ev?.date_time ?? null) ? 'Today' : 'Event')}
            </div>
            <h1 className="dm-title">{ev?.name ?? 'Event'}</h1>
            <div className="dm-heroline">{fmtDay(ev?.date_time ?? null)}</div>
            <div className="dm-heroline dm-venue">{venueLine}</div>
            <div className="dm-herostat">
              <span className="dm-pill">{currentStatusLabel}</span>
              {ev?.guest_count != null ? <span className="dm-pill alt">{ev.guest_count} guests</span> : null}
            </div>
            <button
              type="button"
              className={`dm-checkinbtn${myCheckIn && !myCheckIn.checked_out_at ? ' is-in' : ''}`}
              onClick={() => void toggleMyCheckIn()}
              disabled={checkInBusy}
            >
              {checkInBusy
                ? 'Updating...'
                : myCheckIn && !myCheckIn.checked_out_at
                ? 'Checked in -- tap to check out'
                : 'Check in'}
            </button>
            <AddToCalendar
              title={ev?.name ?? 'Event'}
              start={ev?.date_time}
              location={venueLine}
              details={`${ev?.name ?? 'Event'} on Divini Partners. ${ev?.guest_count != null ? `${ev.guest_count} guests. ` : ''}View: ${typeof window !== 'undefined' ? window.location.origin : ''}/events/${id}`}
              onIcs={() => void downloadIcs()}
              icsBusy={icsBusy}
            />
          </section>

          {/* Final Event Schedule: final count, MY CALL TIME, MY LOCATION,
              receipt confirmation. Personalized per the viewer's own packet
              role -- never a compressed copy of the full desktop packet,
              which stays available via the PDF download below. */}
          {packetProjection ? (
            <section className="dm-block dm-fes">
              <h2 className="dm-blockhead">Final event schedule</h2>
              {packetVersion?.status === 'update_required' ? (
                <div className="dm-fesstale">
                  <span>{packetVersion?.update_required_reason || 'Final event schedule needs an update. Event details changed since this version was issued.'}</span>
                  {packetProjection.audience === 'full' ? (
                    <button type="button" className="dm-fesstalebtn" onClick={() => void regeneratePacket()} disabled={regenBusy}>
                      {regenBusy ? 'Generating...' : 'Generate new version'}
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className="dm-fesgrid">
                <div className="dm-fesstat">
                  <span className="dm-fesnum">
                    {packetProjection.final_count ? packetProjection.final_count.count : '—'}
                  </span>
                  <span className="dm-feslbl">Final count</span>
                </div>
                <div className="dm-fesstat">
                  <span className="dm-festime">{fmtTime(myCallLocation.time)}</span>
                  <span className="dm-feslbl">My call time</span>
                </div>
              </div>
              <div className="dm-fesloc">
                <span className="dm-feslbl">My location</span>
                <span className="dm-fesloctext">{myCallLocation.location || 'To be confirmed'}</span>
              </div>
              {packetProjection.my_final_quantity && packetProjection.my_final_quantity.length > 0 ? (
                <div className="dm-fesloc">
                  <span className="dm-feslbl">My final quantity</span>
                  {packetProjection.my_final_quantity.map((q, i) => (
                    <span key={i} className="dm-fesloctext">
                      {q.quantity} {q.unit} ({q.scope})
                      {q.discrepancy_status && q.discrepancy_status !== 'not_applicable' ? ` -- ${q.discrepancy_status}` : ''}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="dm-fesacts">
                {myAck?.acknowledged_at ? (
                  <span className="dm-fesack is-done">Receipt confirmed</span>
                ) : (
                  <button type="button" className="dm-fesack" onClick={() => void confirmReceipt()} disabled={ackBusy}>
                    {ackBusy ? 'Confirming...' : 'Confirm receipt'}
                  </button>
                )}
                <button type="button" className="dm-fespdf" onClick={() => void downloadPacketPdf()} disabled={pdfBusy}>
                  {pdfBusy ? 'Preparing...' : 'Download PDF'}
                </button>
              </div>
              <div className="dm-fesmeta">
                Version {packetVersion?.version}
                {packetVersion?.status === 'final' ? ' (final)' : ''}
              </div>
            </section>
          ) : null}

          {/* MY NEXT TASK + quick actions (Part 9-10): only for the vendor
              and staff audiences these two named mobile views target --
              owner/planner/venue already have the full desktop workspace.
              Report Issue / Request Change are deliberately not here yet --
              they need the incident (Part 15) and change-request (Part 13)
              systems, which have not shipped yet in this phase; adding
              non-functional buttons for them would violate "do not
              fabricate." */}
          {packetProjection &&
          (packetProjection.audience === 'vendor' ||
            packetProjection.audience === 'vendor_staff' ||
            packetProjection.audience === 'event_staff') ? (
            <section className="dm-block">
              <h2 className="dm-blockhead">My next task</h2>
              {myNextTask ? (
                <div className="dm-mytask">
                  <div className="dm-nowtitle">{myNextTask.name ?? 'Untitled task'}</div>
                  {myNextTask.due_date ? <div className="dm-nowmeta">Due {fmtTime(myNextTask.due_date)}</div> : null}
                </div>
              ) : (
                <div className="dm-empty">No tasks assigned to you right now.</div>
              )}
              <div className="dm-actionsrow">
                {primaryFloorplan?.file_url ? (
                  <a className="dm-actionbtn" href={primaryFloorplan.file_url} target="_blank" rel="noreferrer">View map</a>
                ) : null}
                {vendorSchedule.length > 0 ? <a className="dm-actionbtn" href="#dm-vendor-schedule">My schedule</a> : null}
                <a className="dm-actionbtn" href="#dm-nownext">Run of show</a>
                {contacts.length > 0 ? <a className="dm-actionbtn" href="#dm-contacts">Contact planner</a> : null}
              </div>
            </section>
          ) : null}

          {/* Now / next itinerary */}
          <section className="dm-block" id="dm-nownext">
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

          {/* Vendor arrival/delivery schedule (Part 3): Time/Vendor/Action/
              Location/Contact/Status, server-scoped per role -- a vendor
              sees only their own org's rows here. Omitted entirely when
              empty rather than showing a hollow section. */}
          {vendorSchedule.length > 0 ? (
            <section className="dm-block" id="dm-vendor-schedule">
              <h2 className="dm-blockhead">Vendor arrivals</h2>
              <ul className="dm-vendorsched">
                {vendorSchedule.map((v, idx) => (
                  <li key={`${v.vendor_org_id}-${idx}`} className="dm-vsrow">
                    <div className="dm-vstime">{fmtTime(v.start_time)}</div>
                    <div className="dm-vsbody">
                      <div className="dm-vsname">{v.vendor_name} - {v.action}</div>
                      <div className="dm-vsmeta">
                        {[v.location, v.status.replace(/_/g, ' ')].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <div className="dm-vsacts">
                      {v.contact_phone ? <a className="dm-cact" href={`tel:${v.contact_phone}`}>Call</a> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Today's tasks -- omitted for the sponsor audience (Part
              23-24): the Command Center already treats sponsors as having
              no general task visibility ("Sponsor own activation only"),
              so the sponsor's mobile view gets its own activation
              checklist below instead of the generic ops task list. */}
          {packetProjection?.audience !== 'sponsor' ? (
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
          ) : null}

          {/* Your activation (Part 24): a sponsor's own booth/banner/
              signage checklist for THIS event, self-checkable exactly like
              the ops "Today's tasks" list above -- server-side visibility
              already guarantees sponsorActivations only ever contains this
              sponsor's own org's items. */}
          {packetProjection?.audience === 'sponsor' ? (
            <section className="dm-block">
              <h2 className="dm-blockhead">
                Your activation
                {sponsorActivations.length > 0 ? (
                  <span className="dm-count">
                    {sponsorActivations.filter((a) => a.status === 'complete').length}/{sponsorActivations.length} done
                  </span>
                ) : null}
              </h2>
              {sponsorActivations.length === 0 ? (
                <div className="dm-empty">No activation items set up for you yet. Check with the event planner.</div>
              ) : (
                <ul className="dm-tasks">
                  {sponsorActivations.map((a) => {
                    const done = a.status === 'complete';
                    return (
                      <li key={a.id}>
                        <button
                          type="button"
                          className={`dm-task${done ? ' is-done' : ''}`}
                          onClick={() => void toggleActivation(a)}
                          aria-pressed={done}
                        >
                          <span className="dm-checkbox" aria-hidden="true">{done ? '✓' : ''}</span>
                          <span className="dm-taskbody">
                            <span className="dm-taskname">{a.label}</span>
                            {a.status === 'issue' ? <span className="dm-taskmeta"><span className="dm-pri pri-urgent">issue flagged</span></span> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {/* Key contacts */}
          <section className="dm-block" id="dm-contacts">
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
  --dp-ivory: #F7F4EE; --dp-ink: #2c2a26; --dp-muted: #6b6459; --dp-line: #e7e1d6;
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
.dm-checkinbtn {
  margin-top: 14px; min-height: 52px; width: 100%; padding: 12px 16px; border-radius: 12px;
  background: var(--dp-gold); border: 0; color: var(--dp-emerald); font: inherit; font-size: 15px; font-weight: 700;
  cursor: pointer;
}
.dm-checkinbtn.is-in { background: rgba(255,255,255,.14); color: #fff; border: 1px solid rgba(255,255,255,.35); }
.dm-checkinbtn:disabled { opacity: .6; cursor: default; }

.dm-mytask {
  background: #fff; border: 1px solid var(--dp-line); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px;
}
.dm-actionsrow { display: flex; flex-wrap: wrap; gap: 8px; }
.dm-actionbtn {
  display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 16px;
  border-radius: 11px; background: var(--dp-emerald); color: #fff; text-decoration: none;
  font-size: 13.5px; font-weight: 600;
}
.dm-actionbtn:active { background: var(--dp-emerald-2); }
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

.dm-vendorsched { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.dm-vsrow {
  display: flex; align-items: flex-start; gap: 12px;
  min-height: 60px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--dp-line); background: #fff;
}
.dm-vstime { flex: 0 0 70px; font-size: 13.5px; font-weight: 600; color: var(--dp-emerald); padding-top: 1px; }
.dm-vsbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.dm-vsname { font-size: 14.5px; font-weight: 600; color: var(--dp-ink); }
.dm-vsmeta { font-size: 12px; color: var(--dp-muted); text-transform: capitalize; }
.dm-vsacts { flex: 0 0 auto; }

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

.dm-fes { border: 1px solid var(--dp-gold); }
.dm-fesgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.dm-fesstat {
  display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center;
  background: var(--dp-emerald); color: #fff; border-radius: 14px; padding: 16px 8px;
}
.dm-fesnum, .dm-festime { font-family: 'Cormorant Garamond', Georgia, serif; font-size: 30px; font-weight: 600; line-height: 1; }
.dm-feslbl { font-size: 10.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; color: var(--dp-muted); }
.dm-fesstat .dm-feslbl { color: var(--dp-gold); margin-top: 4px; }
.dm-fesloc {
  display: flex; flex-direction: column; gap: 3px; background: #fff; border: 1px solid var(--dp-line);
  border-radius: 12px; padding: 12px 14px; margin-bottom: 12px;
}
.dm-fesloctext { font-size: 15px; font-weight: 600; color: var(--dp-ink); }
.dm-fesacts { display: flex; gap: 10px; }
.dm-fesack, .dm-fespdf {
  flex: 1; min-height: 52px; padding: 10px 14px; border-radius: 12px; font: inherit; font-size: 14px; font-weight: 600;
  cursor: pointer; border: 0;
}
.dm-fesack { background: var(--dp-gold); color: var(--dp-emerald); }
.dm-fesack.is-done { background: rgba(30,93,74,.12); color: var(--dp-emerald-2); display: flex; align-items: center; justify-content: center; }
.dm-fesack:disabled { opacity: .6; cursor: default; }
.dm-fespdf { background: var(--dp-emerald); color: #fff; }
.dm-fespdf:disabled { opacity: .6; cursor: default; }
.dm-fesmeta { margin-top: 10px; font-size: 11px; color: var(--dp-muted); text-align: center; }

.dm-fesstale {
  display: flex; flex-direction: column; gap: 8px; background: #f6eaea; border: 1px solid #e2caca;
  border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; font-size: 12.5px; color: #8a3a3a; line-height: 1.4;
}
.dm-fesstalebtn {
  align-self: flex-start; min-height: 40px; padding: 8px 16px; border-radius: 10px; border: 0;
  background: #8a3a3a; color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
}
.dm-fesstalebtn:disabled { opacity: .6; cursor: default; }

@media (min-width: 560px) {
  .dm-statusgrid { grid-template-columns: repeat(3, 1fr); }
}
`;
