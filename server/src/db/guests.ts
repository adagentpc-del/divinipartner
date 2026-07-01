/**
 * Phase 6 - Guest List data-access layer (blueprint 14.2).
 *
 * Org-scoped CRUD over the `guests` table (db/schema.sql + db/schema-phase6.sql).
 * Visibility/edit rights piggyback on the event: a user who can see the event
 * can read its guests; an owner of the event can mutate them. RSVP tracking and
 * counts roll up status / VIP / meals / accessibility / check-in.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";
import { guestSync, type GuestListChangeSummary } from "../lib/guestSync.js";

/**
 * Venue Intelligence Addendum (Phase 6) - fire the guest-list to vendor sync.
 *
 * Best-effort: computes a light headcount summary and notifies vendors who
 * opted into guest-list / headcount updates on this event. Never throws and
 * never blocks the guest mutation that triggered it (fire-and-forget).
 */
function fireGuestSync(eventId: string, action: GuestListChangeSummary["action"]): void {
  if (!eventId) return;
  void q1<{ total: string; confirmed: string }>(
    `select count(*) as total,
            count(*) filter (where rsvp_status = 'confirmed') as confirmed
       from guests where event_id = $1`,
    [eventId],
  )
    .then((row) =>
      guestSync.onGuestListChanged(eventId, {
        action,
        total: Number(row?.total ?? 0),
        confirmed: Number(row?.confirmed ?? 0),
      }),
    )
    .catch(() => {
      // Best-effort: swallow so the request is never affected.
    });
}

// Access helpers: read => can see event; write => owns event (mirrors events.ts).
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
    throw new ForbiddenError("only the event owner can edit the guest list");
  }
}

// ---- Reference data --------------------------------------------------------
export const RSVP_STATUSES: { key: string; label: string }[] = [
  { key: "invited", label: "Invited" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "declined", label: "Declined" },
  { key: "waitlist", label: "Waitlisted" },
  { key: "no_response", label: "No response" },
];
const RSVP_KEYS = new Set(RSVP_STATUSES.map((s) => s.key));

export const MEAL_PREFERENCES = [
  "standard",
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten_free",
  "kosher",
  "halal",
  "child",
  "no_preference",
];

export type GuestRow = {
  id: string;
  event_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  rsvp_status: string | null;
  plus_one: boolean | null;
  plus_one_name: string | null;
  party_size: number | null;
  meal_preference: string | null;
  table_assignment: string | null;
  seating_table_id: string | null;
  vip: boolean | null;
  guest_group: string | null;
  invited_by: string | null;
  notes: string | null;
  accessibility_needs: string | null;
  checked_in: boolean | null;
  checked_in_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const SELECT = `select
  id, event_id, name, email, phone, rsvp_status, plus_one, plus_one_name,
  party_size, meal_preference, table_assignment, seating_table_id, vip,
  guest_group, invited_by, notes, accessibility_needs, checked_in, checked_in_at,
  created_at, updated_at
from guests`;

/** List all guests on an event (read access). */
export async function listGuests(actor: Actor, eventId: string): Promise<GuestRow[]> {
  await canSee(actor, eventId);
  return q<GuestRow>(`${SELECT} where event_id = $1 order by created_at asc`, [eventId]);
}

export type GuestInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  rsvp_status?: string | null;
  plus_one?: boolean | null;
  plus_one_name?: string | null;
  party_size?: number | null;
  meal_preference?: string | null;
  table_assignment?: string | null;
  seating_table_id?: string | null;
  vip?: boolean | null;
  guest_group?: string | null;
  invited_by?: string | null;
  notes?: string | null;
  accessibility_needs?: string | null;
};

function normRsvp(v: string | null | undefined): string | null {
  if (v == null) return null;
  return RSVP_KEYS.has(v) ? v : null;
}

/** Add one guest (owner only). */
export async function addGuest(actor: Actor, eventId: string, input: GuestInput): Promise<GuestRow> {
  await requireOwner(actor, eventId);
  const row = await q1<GuestRow>(
    `insert into guests
       (event_id, name, email, phone, rsvp_status, plus_one, plus_one_name, party_size,
        meal_preference, table_assignment, seating_table_id, vip, guest_group, invited_by,
        notes, accessibility_needs, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     returning *`,
    [
      eventId,
      input.name ?? null,
      input.email ?? null,
      input.phone ?? null,
      normRsvp(input.rsvp_status) ?? "invited",
      input.plus_one ?? false,
      input.plus_one_name ?? null,
      input.party_size ?? 1,
      input.meal_preference ?? null,
      input.table_assignment ?? null,
      input.seating_table_id ?? null,
      input.vip ?? false,
      input.guest_group ?? null,
      input.invited_by ?? null,
      input.notes ?? null,
      input.accessibility_needs ?? null,
      actor.user.id,
    ],
  );
  fireGuestSync(eventId, "add");
  return row as GuestRow;
}

/** Bulk add guests (owner only). Each row is an independent insert. */
export async function bulkAddGuests(
  actor: Actor,
  eventId: string,
  rows: GuestInput[],
): Promise<{ added: number; guests: GuestRow[] }> {
  await requireOwner(actor, eventId);
  if (!Array.isArray(rows) || rows.length === 0) return { added: 0, guests: [] };
  const client = await pool.connect();
  const out: GuestRow[] = [];
  try {
    await client.query("begin");
    for (const input of rows.slice(0, 1000)) {
      const r = await client.query<GuestRow>(
        `insert into guests
           (event_id, name, email, phone, rsvp_status, plus_one, plus_one_name, party_size,
            meal_preference, vip, guest_group, invited_by, notes, accessibility_needs, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         returning *`,
        [
          eventId,
          input.name ?? null,
          input.email ?? null,
          input.phone ?? null,
          normRsvp(input.rsvp_status) ?? "invited",
          input.plus_one ?? false,
          input.plus_one_name ?? null,
          input.party_size ?? 1,
          input.meal_preference ?? null,
          input.vip ?? false,
          input.guest_group ?? null,
          input.invited_by ?? null,
          input.notes ?? null,
          input.accessibility_needs ?? null,
          actor.user.id,
        ],
      );
      if (r.rows[0]) out.push(r.rows[0]);
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  if (out.length > 0) fireGuestSync(eventId, "import");
  return { added: out.length, guests: out };
}

async function loadGuestEvent(guestId: string): Promise<string> {
  const g = await q1<{ event_id: string }>(`select event_id from guests where id = $1`, [guestId]);
  if (!g) throw new NotFoundError("guest not found");
  return g.event_id;
}

/** Patch a guest (owner only). */
export async function updateGuest(
  actor: Actor,
  guestId: string,
  patch: GuestInput,
): Promise<GuestRow> {
  const eventId = await loadGuestEvent(guestId);
  await requireOwner(actor, eventId);
  const row = await q1<GuestRow>(
    `update guests set
        name = coalesce($2, name),
        email = coalesce($3, email),
        phone = coalesce($4, phone),
        rsvp_status = coalesce($5, rsvp_status),
        plus_one = coalesce($6, plus_one),
        plus_one_name = coalesce($7, plus_one_name),
        party_size = coalesce($8, party_size),
        meal_preference = coalesce($9, meal_preference),
        table_assignment = coalesce($10, table_assignment),
        seating_table_id = coalesce($11, seating_table_id),
        vip = coalesce($12, vip),
        guest_group = coalesce($13, guest_group),
        invited_by = coalesce($14, invited_by),
        notes = coalesce($15, notes),
        accessibility_needs = coalesce($16, accessibility_needs),
        updated_at = now()
      where id = $1
      returning *`,
    [
      guestId,
      patch.name ?? null,
      patch.email ?? null,
      patch.phone ?? null,
      normRsvp(patch.rsvp_status),
      patch.plus_one ?? null,
      patch.plus_one_name ?? null,
      patch.party_size ?? null,
      patch.meal_preference ?? null,
      patch.table_assignment ?? null,
      patch.seating_table_id ?? null,
      patch.vip ?? null,
      patch.guest_group ?? null,
      patch.invited_by ?? null,
      patch.notes ?? null,
      patch.accessibility_needs ?? null,
    ],
  );
  fireGuestSync(eventId, "update");
  return row as GuestRow;
}

/** Set RSVP status (owner only). */
export async function setRsvp(actor: Actor, guestId: string, status: string): Promise<GuestRow> {
  const eventId = await loadGuestEvent(guestId);
  await requireOwner(actor, eventId);
  if (!RSVP_KEYS.has(status)) throw new ForbiddenError("invalid rsvp status");
  const row = await q1<GuestRow>(
    `update guests set rsvp_status = $2, updated_at = now() where id = $1 returning *`,
    [guestId, status],
  );
  return row as GuestRow;
}

/** Toggle check-in (owner only). */
export async function setCheckedIn(
  actor: Actor,
  guestId: string,
  checkedIn: boolean,
): Promise<GuestRow> {
  const eventId = await loadGuestEvent(guestId);
  await requireOwner(actor, eventId);
  const row = await q1<GuestRow>(
    `update guests set checked_in = $2,
        checked_in_at = case when $2 then now() else null end,
        updated_at = now()
      where id = $1 returning *`,
    [guestId, checkedIn],
  );
  return row as GuestRow;
}

/** Delete a guest (owner only). */
export async function deleteGuest(actor: Actor, guestId: string): Promise<void> {
  const eventId = await loadGuestEvent(guestId);
  await requireOwner(actor, eventId);
  await pool.query(`delete from guests where id = $1`, [guestId]);
  fireGuestSync(eventId, "delete");
}

export type GuestCounts = {
  total: number;
  parties: number;
  heads: number;
  vip: number;
  plus_ones: number;
  checked_in: number;
  by_rsvp: Record<string, number>;
  by_meal: Record<string, number>;
  accessibility: number;
};

export type Headcount = {
  event_id: string;
  total: number;
  confirmed: number;
  checked_in: number;
};

/**
 * Lightweight event-day headcount: total guests, confirmed RSVPs and how many
 * have checked in. One aggregate query, scoped by event access (read).
 */
export async function headcount(actor: Actor, eventId: string): Promise<Headcount> {
  await canSee(actor, eventId);
  const row = await q1<{ total: string; confirmed: string; checked_in: string }>(
    `select
        count(*) as total,
        count(*) filter (where rsvp_status = 'confirmed') as confirmed,
        count(*) filter (where checked_in) as checked_in
       from guests where event_id = $1`,
    [eventId],
  );
  return {
    event_id: eventId,
    total: Number(row?.total ?? 0),
    confirmed: Number(row?.confirmed ?? 0),
    checked_in: Number(row?.checked_in ?? 0),
  };
}

/** Roll up RSVP / VIP / meal / accessibility counts for an event. */
export async function guestCounts(actor: Actor, eventId: string): Promise<GuestCounts> {
  const rows = await listGuests(actor, eventId);
  const counts: GuestCounts = {
    total: rows.length,
    parties: rows.length,
    heads: 0,
    vip: 0,
    plus_ones: 0,
    checked_in: 0,
    by_rsvp: {},
    by_meal: {},
    accessibility: 0,
  };
  for (const s of RSVP_STATUSES) counts.by_rsvp[s.key] = 0;
  for (const g of rows) {
    const party = (g.party_size ?? 1) + (g.plus_one ? 1 : 0);
    counts.heads += party;
    if (g.vip) counts.vip += 1;
    if (g.plus_one) counts.plus_ones += 1;
    if (g.checked_in) counts.checked_in += 1;
    if (g.accessibility_needs && g.accessibility_needs.trim()) counts.accessibility += 1;
    const rsvp = g.rsvp_status ?? "no_response";
    counts.by_rsvp[rsvp] = (counts.by_rsvp[rsvp] ?? 0) + 1;
    if (g.meal_preference) {
      counts.by_meal[g.meal_preference] = (counts.by_meal[g.meal_preference] ?? 0) + 1;
    }
  }
  return counts;
}
