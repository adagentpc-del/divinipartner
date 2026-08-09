/**
 * Vendor and staff check-in / check-out (live-ops phase, Part 7-8, 2026-08-09).
 *
 * event_check_ins (db/schema-event-check-ins.sql) is the one durable record
 * of who is physically present, when they arrived, and when they left.
 * role and organization_id are always resolved server-side from the
 * target's real event_members row -- never client-supplied -- so this
 * table can never be used to spoof a role or vendor affiliation.
 *
 * checkIn() is idempotent against a concurrent duplicate: the partial
 * unique index (event_id, user_id) WHERE checked_out_at IS NULL means two
 * simultaneous "check in" taps from the same device (or a retried request)
 * resolve to the SAME open row rather than two rows -- the concurrency bug
 * Part 42's adversarial pass explicitly calls out ("duplicate vendor
 * check-in").
 *
 * Authorization: self check-in/out is always allowed for an active member;
 * on-behalf check-in/out is owner/planner (front-desk coordination) or a
 * vendor_owner acting on their OWN org's staff (a lead checking in their
 * crew) -- never another vendor's people, matching the vendor-isolation
 * rule enforced everywhere else in this phase.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { getEventRole } from "./eventMembers.js";
import { getVendorArrivalSchedule } from "./itinerary.js";
import { audienceForRole } from "../lib/packetProjection.js";
import { deriveArrivalStatus, type ArrivalStatus } from "../lib/arrivalStatus.js";
import type { EventRole } from "../lib/eventRoles.js";

export type CheckInRow = {
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

async function resolveTargetMember(
  eventId: string,
  userId: string,
): Promise<{ role: EventRole; organization_id: string | null } | null> {
  return q1<{ role: EventRole; organization_id: string | null }>(
    `select role, organization_id from event_members where event_id = $1 and user_id = $2 and status = 'active'`,
    [eventId, userId],
  );
}

async function canActOnBehalfOf(
  actor: Actor,
  eventId: string,
  targetUserId: string,
  targetOrgId: string | null,
): Promise<boolean> {
  if (targetUserId === actor.user.id) return true;
  if (await canManageEvent(actor, eventId)) return true;
  const actorRole = await getEventRole(actor, eventId);
  return actorRole === "vendor_owner" && !!actor.org?.id && !!targetOrgId && actor.org.id === targetOrgId;
}

export type CheckInInput = {
  userId?: string;
  assigned_location?: string | null;
  source_device?: string | null;
  notes?: string | null;
};

export async function checkIn(actor: Actor, eventId: string, opts: CheckInInput = {}): Promise<CheckInRow> {
  await getEvent(actor, eventId);
  const targetUserId = opts.userId ?? actor.user.id;
  const member = await resolveTargetMember(eventId, targetUserId);
  if (!member) throw new ForbiddenError("target user is not an active member of this event");
  if (!(await canActOnBehalfOf(actor, eventId, targetUserId, member.organization_id))) {
    throw new ForbiddenError("you cannot check in this user");
  }

  const inserted = await q1<CheckInRow>(
    `insert into event_check_ins
       (event_id, user_id, organization_id, role, assigned_location, source_device, notes, checked_in_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (event_id, user_id) where checked_out_at is null do nothing
     returning *`,
    [
      eventId,
      targetUserId,
      member.organization_id,
      member.role,
      opts.assigned_location ?? null,
      opts.source_device ?? null,
      opts.notes ?? null,
      actor.user.id,
    ],
  );
  if (inserted) return inserted;

  // Lost the race to a concurrent check-in (or this is a plain re-tap while
  // already checked in): return the open row rather than erroring.
  const existing = await q1<CheckInRow>(
    `select * from event_check_ins where event_id = $1 and user_id = $2 and checked_out_at is null`,
    [eventId, targetUserId],
  );
  if (!existing) throw new Error("check-in failed unexpectedly");
  return existing;
}

export async function checkOut(actor: Actor, eventId: string, opts: { userId?: string } = {}): Promise<CheckInRow> {
  await getEvent(actor, eventId);
  const targetUserId = opts.userId ?? actor.user.id;
  const member = await resolveTargetMember(eventId, targetUserId);
  if (!member) throw new ForbiddenError("target user is not an active member of this event");
  if (!(await canActOnBehalfOf(actor, eventId, targetUserId, member.organization_id))) {
    throw new ForbiddenError("you cannot check out this user");
  }
  const row = await q1<CheckInRow>(
    `update event_check_ins set checked_out_at = now(), checked_out_by = $3
      where event_id = $1 and user_id = $2 and checked_out_at is null
      returning *`,
    [eventId, targetUserId, actor.user.id],
  );
  if (!row) throw new NotFoundError("no open check-in found for this user");
  return row;
}

/** The actor's own most recent check-in on this event, or null. Powers the
 *  mobile "MY EVENT" check-in button state. */
export async function myCheckInStatus(actor: Actor, eventId: string): Promise<CheckInRow | null> {
  await getEvent(actor, eventId);
  return q1<CheckInRow>(
    `select * from event_check_ins where event_id = $1 and user_id = $2 order by checked_in_at desc limit 1`,
    [eventId, actor.user.id],
  );
}

/**
 * Role-scoped check-in roster: owner/planner/venue see everyone,
 * vendor/vendor_staff see only their own org's rows, everyone else sees
 * only their own row -- the same vendor-isolation rule
 * getVendorArrivalSchedule already enforces.
 */
export async function listCheckIns(actor: Actor, eventId: string): Promise<CheckInRow[]> {
  await getEvent(actor, eventId);
  const role = (await getEventRole(actor, eventId)) ?? "read_only";
  const audience = audienceForRole(role);
  if (audience === "full" || audience === "venue") {
    return q<CheckInRow>(`select * from event_check_ins where event_id = $1 order by checked_in_at desc`, [eventId]);
  }
  if (audience === "vendor" || audience === "vendor_staff") {
    const ownOrgId = actor.org?.id ?? null;
    if (!ownOrgId) return [];
    return q<CheckInRow>(
      `select * from event_check_ins where event_id = $1 and organization_id = $2 order by checked_in_at desc`,
      [eventId, ownOrgId],
    );
  }
  return q<CheckInRow>(
    `select * from event_check_ins where event_id = $1 and user_id = $2 order by checked_in_at desc`,
    [eventId, actor.user.id],
  );
}

export type VendorArrivalSummaryRow = {
  organization_id: string;
  vendor_name: string;
  scheduled_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  status: ArrivalStatus;
};

/**
 * The "VENDOR ARRIVALS" summary (Part 7): one row per vendor org with a
 * scheduled arrival/delivery item, its earliest scheduled time, and its
 * current arrival status -- built purely from getVendorArrivalSchedule
 * (already the single source for scheduled vendor times, and already
 * audience-narrowed -- full/venue see every org, vendor/vendor_staff see
 * only their own) joined against event_check_ins. No separate
 * authorization gate here: whatever getVendorArrivalSchedule would show
 * this actor is exactly what this summarizes, so a vendor calling this
 * only ever sees their own org's arrival status, never another vendor's,
 * and sponsor/event_staff naturally get an empty list.
 */
export async function vendorArrivalsSummary(actor: Actor, eventId: string): Promise<VendorArrivalSummaryRow[]> {
  const scheduleRows = await getVendorArrivalSchedule(actor, eventId);
  const byOrg = new Map<string, { vendor_name: string; scheduled_at: string | null }>();
  for (const r of scheduleRows) {
    const cur = byOrg.get(r.vendor_org_id);
    const earlier =
      r.start_time && (!cur?.scheduled_at || new Date(r.start_time).getTime() < new Date(cur.scheduled_at).getTime());
    if (!cur || earlier) {
      byOrg.set(r.vendor_org_id, { vendor_name: r.vendor_name, scheduled_at: r.start_time ?? cur?.scheduled_at ?? null });
    }
  }

  const checkins = await q<{ organization_id: string; checked_in_at: string; checked_out_at: string | null }>(
    `select organization_id, checked_in_at, checked_out_at from event_check_ins
      where event_id = $1 and organization_id is not null
      order by checked_in_at desc`,
    [eventId],
  );
  const checkinByOrg = new Map<string, { checked_in_at: string; checked_out_at: string | null }>();
  for (const c of checkins) {
    if (!checkinByOrg.has(c.organization_id)) checkinByOrg.set(c.organization_id, c);
  }

  const now = Date.now();
  const rows: VendorArrivalSummaryRow[] = [];
  for (const [orgId, meta] of byOrg) {
    const ci = checkinByOrg.get(orgId) ?? null;
    rows.push({
      organization_id: orgId,
      vendor_name: meta.vendor_name,
      scheduled_at: meta.scheduled_at,
      checked_in_at: ci?.checked_in_at ?? null,
      checked_out_at: ci?.checked_out_at ?? null,
      status: deriveArrivalStatus(meta.scheduled_at, ci?.checked_in_at ?? null, ci?.checked_out_at ?? null, now),
    });
  }
  return rows.sort((a, b) => {
    const ta = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
    const tb = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.POSITIVE_INFINITY;
    return ta - tb;
  });
}
