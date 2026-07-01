/**
 * Phase 3 - Events data-access layer (Event Workspace).
 *
 * Org-scoped CRUD over the `events` table from db/schema.sql plus event-vendor
 * association (stored in event_vendors, see db/schema-phase3.sql). Every read
 * is scoped to the acting org: a user sees an event when their org is the
 * owning organization, or they are the named client or planner, or their org
 * is attached to the event as a vendor. Writes require ownership (org match,
 * planner, or super_admin).
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { buildItinerary } from "./itinerary.js";

// ---- Status model (blueprint section 13) -----------------------------------
export type EventStatus =
  | "inquiry"
  | "venue_reviewing"
  | "venue_hold"
  | "vendor_bidding"
  | "quotes_received"
  | "vendor_selected"
  | "deposit_due"
  | "in_production"
  | "install_scheduled"
  | "itinerary_confirmed"
  | "event_day"
  | "completed"
  | "closed"
  | "archived";

/** Ordered list with human labels (display order matches the lifecycle). */
export const EVENT_STATUSES: { key: EventStatus; label: string }[] = [
  { key: "inquiry", label: "Inquiry" },
  { key: "venue_reviewing", label: "Venue reviewing" },
  { key: "venue_hold", label: "Venue hold placed" },
  { key: "vendor_bidding", label: "Vendor bidding" },
  { key: "quotes_received", label: "Quotes received" },
  { key: "vendor_selected", label: "Vendor selected" },
  { key: "deposit_due", label: "Deposit due" },
  { key: "in_production", label: "In production" },
  { key: "install_scheduled", label: "Install scheduled" },
  { key: "itinerary_confirmed", label: "Itinerary confirmed" },
  { key: "event_day", label: "Event day active" },
  { key: "completed", label: "Completed" },
  { key: "closed", label: "Closed" },
  { key: "archived", label: "Archived" },
];

const STATUS_KEYS = new Set<string>(EVENT_STATUSES.map((s) => s.key));
export function isEventStatus(v: unknown): v is EventStatus {
  return typeof v === "string" && STATUS_KEYS.has(v);
}

export type EventRow = {
  id: string;
  name: string;
  type: string | null;
  client_id: string | null;
  planner_id: string | null;
  venue_id: string | null;
  organization_id: string | null;
  date_time: string | null;
  guest_count: number | null;
  budget: string | null;
  event_goals: string | null;
  required_services: string[] | null;
  branding_opportunity_id: string | null;
  status: EventStatus | null;
  itinerary: unknown;
  created_at: string;
  updated_at: string;
};

/** True when the actor may see this event (owner org, client, planner, or attached vendor). */
async function actorCanSee(actor: Actor, eventId: string): Promise<boolean> {
  if (actor.user.role === "super_admin" || actor.user.role === "admin") return true;
  const row = await q1<{ ok: boolean }>(
    `select true as ok
       from events e
      where e.id = $1
        and (
          ($2::uuid is not null and e.organization_id = $2)
          or e.client_id = $3
          or e.planner_id = $3
          or exists (
            select 1 from event_vendors ev
             where ev.event_id = e.id and ev.organization_id = $2
          )
        )
      limit 1`,
    [eventId, actor.org?.id ?? null, actor.user.id],
  );
  return !!row?.ok;
}

/** List the events the actor can access, newest first. */
export async function listMyEvents(actor: Actor): Promise<EventRow[]> {
  if (actor.user.role === "super_admin" || actor.user.role === "admin") {
    return q<EventRow>(`select * from events order by created_at desc limit 500`);
  }
  return q<EventRow>(
    `select distinct e.*
       from events e
       left join event_vendors ev on ev.event_id = e.id
      where ($1::uuid is not null and e.organization_id = $1)
         or e.client_id = $2
         or e.planner_id = $2
         or ($1::uuid is not null and ev.organization_id = $1)
      order by e.created_at desc
      limit 500`,
    [actor.org?.id ?? null, actor.user.id],
  );
}

/** Get a single event the actor can access, or throw NotFound/Forbidden. */
export async function getEvent(actor: Actor, id: string): Promise<EventRow> {
  const ev = await q1<EventRow>(`select * from events where id = $1`, [id]);
  if (!ev) throw new NotFoundError("event not found");
  if (!(await actorCanSee(actor, id))) throw new ForbiddenError("no access to event");
  return ev;
}

export type CreateEventInput = {
  name: string;
  type?: string | null;
  date_time?: string | null;
  guest_count?: number | null;
  budget?: number | null;
  event_goals?: string | null;
  required_services?: string[] | null;
  venue_id?: string | null;
  branding_opportunity_id?: string | null;
};

/** Create an event owned by the actor's org; the actor is client or planner by role. */
export async function createEvent(actor: Actor, input: CreateEventInput): Promise<EventRow> {
  const isPlanner = actor.user.role === "planner";
  const row = await q1<EventRow>(
    `insert into events
       (name, type, client_id, planner_id, venue_id, organization_id,
        date_time, guest_count, budget, event_goals, required_services,
        branding_opportunity_id, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'inquiry')
     returning *`,
    [
      input.name,
      input.type ?? null,
      isPlanner ? null : actor.user.id,
      isPlanner ? actor.user.id : null,
      input.venue_id ?? null,
      actor.org?.id ?? null,
      input.date_time ?? null,
      input.guest_count ?? null,
      input.budget ?? null,
      input.event_goals ?? null,
      input.required_services ?? null,
      input.branding_opportunity_id ?? null,
    ],
  );
  return row as EventRow;
}

/** True when the actor owns the event (org match, named planner/client, or admin). */
async function actorOwns(actor: Actor, eventId: string): Promise<boolean> {
  if (actor.user.role === "super_admin" || actor.user.role === "admin") return true;
  const row = await q1<{ ok: boolean }>(
    `select true as ok from events
      where id = $1
        and (($2::uuid is not null and organization_id = $2)
             or client_id = $3 or planner_id = $3)
      limit 1`,
    [eventId, actor.org?.id ?? null, actor.user.id],
  );
  return !!row?.ok;
}

export type UpdateEventInput = Partial<CreateEventInput>;

/** Patch core event fields (owner only). */
export async function updateEvent(
  actor: Actor,
  id: string,
  patch: UpdateEventInput,
): Promise<EventRow> {
  await getEvent(actor, id);
  if (!(await actorOwns(actor, id))) throw new ForbiddenError("only the event owner can edit");
  const row = await q1<EventRow>(
    `update events set
        name = coalesce($2, name),
        type = coalesce($3, type),
        date_time = coalesce($4, date_time),
        guest_count = coalesce($5, guest_count),
        budget = coalesce($6, budget),
        event_goals = coalesce($7, event_goals),
        required_services = coalesce($8, required_services),
        venue_id = coalesce($9, venue_id),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.name ?? null,
      patch.type ?? null,
      patch.date_time ?? null,
      patch.guest_count ?? null,
      patch.budget ?? null,
      patch.event_goals ?? null,
      patch.required_services ?? null,
      patch.venue_id ?? null,
    ],
  );
  return row as EventRow;
}

/** Move an event to a new lifecycle status (owner only). */
export async function setEventStatus(
  actor: Actor,
  id: string,
  status: EventStatus,
): Promise<EventRow> {
  await getEvent(actor, id);
  if (!(await actorOwns(actor, id))) throw new ForbiddenError("only the event owner can transition status");
  if (!isEventStatus(status)) throw new ForbiddenError("invalid status");
  const row = await q1<EventRow>(
    `update events set status = $2, updated_at = now() where id = $1 returning *`,
    [id, status],
  );
  return row as EventRow;
}

export type EventVendorRow = {
  id: string;
  event_id: string;
  organization_id: string;
  vendor_id: string | null;
  role: string | null;
  status: string | null;
  created_at: string;
  vendor_name: string;
};

/** List vendors attached to an event. */
export async function listEventVendors(actor: Actor, eventId: string): Promise<EventVendorRow[]> {
  await getEvent(actor, eventId);
  // Additive, read-only LEFT JOIN to surface a human display name for each
  // attached vendor. The vendors table has no name of its own, so the name
  // source is the organization name (coalesced to 'Vendor' when missing).
  return q<EventVendorRow>(
    `select ev.*,
            coalesce(o.name, 'Vendor') as vendor_name
       from event_vendors ev
       left join organizations o on o.id = ev.organization_id
      where ev.event_id = $1
      order by ev.created_at asc`,
    [eventId],
  );
}

/** Attach a vendor org to an event (owner only). Idempotent per (event, org). */
export async function addEventVendor(
  actor: Actor,
  eventId: string,
  input: { organization_id: string; vendor_id?: string | null; role?: string | null },
): Promise<EventVendorRow> {
  await getEvent(actor, eventId);
  if (!(await actorOwns(actor, eventId))) throw new ForbiddenError("only the event owner can add vendors");
  const row = await q1<EventVendorRow>(
    `insert into event_vendors (event_id, organization_id, vendor_id, role, status)
       values ($1,$2,$3,$4,'added')
     on conflict (event_id, organization_id) do update set
        vendor_id = coalesce(excluded.vendor_id, event_vendors.vendor_id),
        role = coalesce(excluded.role, event_vendors.role)
     returning *`,
    [eventId, input.organization_id, input.vendor_id ?? null, input.role ?? null],
  );
  return row as EventVendorRow;
}

/** Detach a vendor org from an event (owner only). */
export async function removeEventVendor(
  actor: Actor,
  eventId: string,
  eventVendorId: string,
): Promise<void> {
  await getEvent(actor, eventId);
  if (!(await actorOwns(actor, eventId))) throw new ForbiddenError("only the event owner can remove vendors");
  await pool.query(`delete from event_vendors where id = $1 and event_id = $2`, [
    eventVendorId,
    eventId,
  ]);
}

/**
 * Build a vendor-ready "bid package" from the event's own data. No fabrication:
 * every field is derived from stored columns; absent data is reported as such.
 */
export async function buildBidPackage(actor: Actor, eventId: string) {
  const ev = await getEvent(actor, eventId);
  const venue = ev.venue_id
    ? await q1<{ name: string; city: string | null; region: string | null; capacity: number | null }>(
        `select name, city, region, capacity from venues where id = $1`,
        [ev.venue_id],
      )
    : null;
  const required = ev.required_services ?? [];
  return {
    generated_at: new Date().toISOString(),
    source: "event-record",
    event: {
      id: ev.id,
      name: ev.name,
      type: ev.type,
      date_time: ev.date_time,
      guest_count: ev.guest_count,
      budget: ev.budget,
      status: ev.status,
    },
    venue: venue
      ? { name: venue.name, city: venue.city, region: venue.region, capacity: venue.capacity }
      : { note: "No venue selected yet." },
    scope: {
      goals: ev.event_goals ?? null,
      required_services: required,
      services_count: required.length,
    },
    notes:
      "This package is assembled from the event record only. Vendors should confirm details before quoting.",
  };
}

// ============================================================================
// ICS CALENDAR EXPORT (fully local string generation, no external API)
// ============================================================================

/** Fold an ICS content line to the 75-octet limit per RFC 5545 (3.1). */
function icsFold(line: string): string {
  if (line.length <= 75) return line;
  const out: string[] = [];
  let rest = line;
  out.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length > 0) {
    out.push(" " + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  return out.join("\r\n");
}

/** Escape a value for an ICS text property (RFC 5545 3.3.11). */
function icsText(v: string | null | undefined): string {
  if (v == null) return "";
  return String(v)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Format an ISO timestamp as a UTC ICS date-time (YYYYMMDDTHHMMSSZ). */
function icsDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
  );
}

/** Stable, calendar-safe slug for a UID seed. */
function slug(v: string): string {
  return v.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "item";
}

/**
 * Build a valid text/calendar (.ics) document for an event from stored data
 * only: a VEVENT for the event itself plus VEVENTs for the key itinerary
 * milestones (load-in, program start/end, payment deadlines, etc). Pure string
 * generation, no library and no third-party calendar API.
 */
export async function buildEventIcs(
  actor: Actor,
  eventId: string,
): Promise<{ filename: string; ics: string }> {
  const ev = await getEvent(actor, eventId);
  const itinerary = await buildItinerary(actor, eventId);

  const stamp = icsDate(new Date().toISOString()) ?? "19700101T000000Z";
  const domain = "divinipartners.com";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Divini Partners//Event Day//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsText(ev.name)}`,
  ];

  const pushEvent = (opts: {
    uid: string;
    start: string | null;
    end: string | null;
    summary: string;
    description?: string | null;
    location?: string | null;
  }) => {
    const dtStart = icsDate(opts.start);
    if (!dtStart) return; // skip milestones with no usable time
    const dtEnd = icsDate(opts.end) ?? dtStart;
    lines.push("BEGIN:VEVENT");
    lines.push(icsFold(`UID:${opts.uid}@${domain}`));
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(icsFold(`SUMMARY:${icsText(opts.summary)}`));
    if (opts.description) lines.push(icsFold(`DESCRIPTION:${icsText(opts.description)}`));
    if (opts.location) lines.push(icsFold(`LOCATION:${icsText(opts.location)}`));
    lines.push("END:VEVENT");
  };

  // The event itself (anchor VEVENT).
  const eventLocation =
    itinerary.items.find((i) => i.location)?.location ?? null;
  pushEvent({
    uid: `event-${slug(ev.id)}`,
    start: ev.date_time,
    end: itinerary.items.find((i) => i.key === "auto_program")?.end_time ?? ev.date_time,
    summary: ev.name,
    description: ev.event_goals ? `Goals: ${ev.event_goals}` : "Event day",
    location: eventLocation,
  });

  // Key itinerary milestones (load-in, program, payment deadlines, etc).
  for (const item of itinerary.items) {
    if (!item.start_time) continue;
    if (item.key === "auto_doors") continue; // overlaps the anchor event start
    pushEvent({
      uid: `${slug(ev.id)}-${slug(item.key)}`,
      start: item.start_time,
      end: item.end_time,
      summary: item.title,
      description: item.description,
      location: item.location,
    });
  }

  lines.push("END:VCALENDAR");
  const ics = lines.join("\r\n") + "\r\n";
  const filename = `${slug(ev.name) || "event"}.ics`;
  return { filename, ics };
}
