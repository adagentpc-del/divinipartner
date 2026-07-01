/**
 * Friction Elimination - U15 Guest Experience Hub (data-access layer).
 *
 * A NEW attendee layer over `event_registrations` and `event_info`
 * (db/schema-fe-install-guest.sql). This is deliberately separate from the
 * existing `guests` table / event-day check-in flow: `guests` is the planner's
 * private invite list, while this layer is the public-facing attendee
 * experience (self-registration, RSVP, ticketing, QR check-in, schedule, venue
 * map, parking, last-minute updates).
 *
 * IDOR: management reads/writes piggyback on the parent event (see-event to
 * read, own-event to mutate), mirroring guests.ts. A small set of attendee-safe
 * lookups (RSVP by token, check-in by qr_code, public event info) operate
 * without an actor and are intentionally scoped to a single registration / a
 * single event_id, never enumerating across tenants.
 *
 * Additive only. Does not touch the existing guests / event-day files.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";

// ---- Reference data --------------------------------------------------------
export const RSVP_STATUSES: { key: string; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "going", label: "Going" },
  { key: "maybe", label: "Maybe" },
  { key: "not_going", label: "Not going" },
  { key: "waitlist", label: "Waitlisted" },
];
const RSVP_KEYS = new Set(RSVP_STATUSES.map((s) => s.key));

// Access helpers: read => can see event; write => owns event (mirrors guests.ts).
async function canSee(actor: Actor, eventId: string): Promise<void> {
  await getEvent(actor, eventId); // throws NotFound / Forbidden
}
async function owns(actor: Actor, eventId: string): Promise<boolean> {
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
async function requireOwner(actor: Actor, eventId: string): Promise<void> {
  await canSee(actor, eventId);
  if (!(await owns(actor, eventId))) {
    throw new ForbiddenError("only the event owner can manage registrations");
  }
}

function normRsvp(v: string | null | undefined): string | null {
  if (v == null) return null;
  return RSVP_KEYS.has(v) ? v : null;
}

// Random-ish QR token built from stored data only (no external library).
function genQrCode(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `DP-${Date.now().toString(36)}-${rnd}`.toUpperCase();
}

// ============================================================================
// REGISTRATIONS
// ============================================================================
export type RegistrationRow = {
  id: string;
  event_id: string;
  attendee_name: string | null;
  email: string | null;
  rsvp_status: string | null;
  ticket_type: string | null;
  qr_code: string | null;
  checked_in: boolean | null;
  checked_in_at: string | null;
  created_at: string;
};

const SELECT = `select
  id, event_id, attendee_name, email, rsvp_status, ticket_type, qr_code,
  checked_in, checked_in_at, created_at
from event_registrations`;

/** List registrations on an event (read access). */
export async function listRegistrations(actor: Actor, eventId: string): Promise<RegistrationRow[]> {
  await canSee(actor, eventId);
  return q<RegistrationRow>(
    `${SELECT} where event_id = $1 order by created_at asc`,
    [eventId],
  );
}

export type RegistrationInput = {
  attendee_name?: string | null;
  email?: string | null;
  rsvp_status?: string | null;
  ticket_type?: string | null;
};

/** Create a registration on an event (owner only). Generates a unique QR code. */
export async function createRegistration(
  actor: Actor,
  eventId: string,
  input: RegistrationInput,
): Promise<RegistrationRow> {
  await requireOwner(actor, eventId);
  // Try a few times in case of a (very unlikely) qr_code collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const row = await q1<RegistrationRow>(
        `insert into event_registrations
           (event_id, attendee_name, email, rsvp_status, ticket_type, qr_code)
         values ($1,$2,$3,$4,$5,$6)
         returning *`,
        [
          eventId,
          input.attendee_name ?? null,
          input.email ?? null,
          normRsvp(input.rsvp_status) ?? "pending",
          input.ticket_type ?? null,
          genQrCode(),
        ],
      );
      return row as RegistrationRow;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "23505" && attempt < 4) continue; // unique violation on qr_code
      throw e;
    }
  }
  throw new Error("could not allocate a unique QR code");
}

async function loadRegEvent(regId: string): Promise<string> {
  const r = await q1<{ event_id: string }>(
    `select event_id from event_registrations where id = $1`,
    [regId],
  );
  if (!r) throw new NotFoundError("registration not found");
  return r.event_id;
}

/** Patch a registration (owner only). */
export async function updateRegistration(
  actor: Actor,
  regId: string,
  patch: RegistrationInput,
): Promise<RegistrationRow> {
  const eventId = await loadRegEvent(regId);
  await requireOwner(actor, eventId);
  const row = await q1<RegistrationRow>(
    `update event_registrations set
        attendee_name = coalesce($2, attendee_name),
        email = coalesce($3, email),
        rsvp_status = coalesce($4, rsvp_status),
        ticket_type = coalesce($5, ticket_type)
      where id = $1
      returning *`,
    [
      regId,
      patch.attendee_name ?? null,
      patch.email ?? null,
      normRsvp(patch.rsvp_status),
      patch.ticket_type ?? null,
    ],
  );
  if (!row) throw new NotFoundError("registration not found");
  return row;
}

/** Set RSVP status on a registration (owner only). */
export async function setRsvp(
  actor: Actor,
  regId: string,
  status: string,
): Promise<RegistrationRow> {
  const eventId = await loadRegEvent(regId);
  await requireOwner(actor, eventId);
  if (!RSVP_KEYS.has(status)) throw new ForbiddenError("invalid rsvp status");
  const row = await q1<RegistrationRow>(
    `update event_registrations set rsvp_status = $2 where id = $1 returning *`,
    [regId, status],
  );
  if (!row) throw new NotFoundError("registration not found");
  return row;
}

/** Delete a registration (owner only). */
export async function deleteRegistration(actor: Actor, regId: string): Promise<void> {
  const eventId = await loadRegEvent(regId);
  await requireOwner(actor, eventId);
  await pool.query(`delete from event_registrations where id = $1`, [regId]);
}

/**
 * Check in an attendee by QR code (owner only). The actor must own the event
 * the scanned registration belongs to; a forged / foreign QR is rejected
 * (NotFound) and a registration outside the actor's tenant throws Forbidden.
 */
export async function checkInByQr(actor: Actor, qrCode: string): Promise<RegistrationRow> {
  const trimmed = (qrCode || "").trim();
  if (!trimmed) throw new NotFoundError("registration not found");
  const reg = await q1<RegistrationRow>(`${SELECT} where qr_code = $1`, [trimmed]);
  if (!reg) throw new NotFoundError("registration not found");
  await requireOwner(actor, reg.event_id);
  const row = await q1<RegistrationRow>(
    `update event_registrations set checked_in = true, checked_in_at = now()
      where id = $1 returning *`,
    [reg.id],
  );
  return row as RegistrationRow;
}

// ============================================================================
// EVENT INFO (attendee-facing schedule / map / parking / updates)
// ============================================================================
export type EventInfoRow = {
  id: string;
  event_id: string;
  schedule: unknown;
  venue_map_url: string | null;
  parking_info: string | null;
  updates: unknown;
  updated_at: string | null;
};

const INFO_SELECT = `select
  id, event_id, schedule, venue_map_url, parking_info, updates, updated_at
from event_info`;

/** Get the attendee-facing info for an event (read access). May be null. */
export async function getEventInfo(actor: Actor, eventId: string): Promise<EventInfoRow | null> {
  await canSee(actor, eventId);
  return q1<EventInfoRow>(`${INFO_SELECT} where event_id = $1`, [eventId]);
}

export type EventInfoInput = {
  schedule?: unknown;
  venue_map_url?: string | null;
  parking_info?: string | null;
  updates?: unknown;
};

/** Create or update the attendee-facing info for an event (owner only). */
export async function upsertEventInfo(
  actor: Actor,
  eventId: string,
  input: EventInfoInput,
): Promise<EventInfoRow> {
  await requireOwner(actor, eventId);
  const row = await q1<EventInfoRow>(
    `insert into event_info (event_id, schedule, venue_map_url, parking_info, updates, updated_at)
       values ($1,$2,$3,$4,$5, now())
     on conflict (event_id) do update set
       schedule = coalesce(excluded.schedule, event_info.schedule),
       venue_map_url = coalesce(excluded.venue_map_url, event_info.venue_map_url),
       parking_info = coalesce(excluded.parking_info, event_info.parking_info),
       updates = coalesce(excluded.updates, event_info.updates),
       updated_at = now()
     returning *`,
    [
      eventId,
      input.schedule ?? null,
      input.venue_map_url ?? null,
      input.parking_info ?? null,
      input.updates ?? null,
    ],
  );
  return row as EventInfoRow;
}

/**
 * Public attendee-facing event info: schedule / map / parking / updates plus a
 * minimal event header. NO actor required and NO cross-tenant enumeration: it
 * reads exactly one event_id and returns only attendee-safe fields. Returns
 * null when the event does not exist.
 */
export async function getPublicEventInfo(eventId: string): Promise<{
  event: { id: string; name: string; date_time: string | null } | null;
  info: EventInfoRow | null;
} | null> {
  const ev = await q1<{ id: string; name: string; date_time: string | null }>(
    `select id, name, date_time from events where id = $1`,
    [eventId],
  );
  if (!ev) return null;
  const info = await q1<EventInfoRow>(`${INFO_SELECT} where event_id = $1`, [eventId]);
  return { event: ev, info };
}
