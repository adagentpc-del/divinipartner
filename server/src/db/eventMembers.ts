/**
 * Event Membership + Event-Level RBAC (Divini Partners 63-section Event
 * Operations spec, Phase A items 2-3, 2026-08-09).
 *
 * event_vendors (db/schema-phase3.sql) answers "is org X attached to this
 * event" at the organization level. It cannot answer "does this specific
 * human have access, and with what role" -- vendor_team_members and
 * vendor_account_assignments are vendor-org-internal and never reach event
 * authorization, and events.actorCanSee/actorOwns only ever resolve to
 * owner-or-not. event_members (db/schema-event-invitations.sql) is the new
 * table that answers that question, without duplicating event_vendors: a
 * member row may optionally point back at the event_vendors row it
 * corresponds to via event_vendor_id.
 *
 * Backward compatibility: a vendor org attached via event_vendors before this
 * feature existed (including every quote-submission self-attach from
 * db/quotes.ts::createQuote) has no event_members row yet. getEventRole
 * falls back to a synthesized "vendor_owner" role for such actors so nothing
 * that worked yesterday stops working today; the roster (listEventMembers)
 * only shows explicit rows, so that fallback is intentionally invisible
 * until the org actually gets an explicit membership row (e.g. by inviting a
 * second person from the same vendor org into a specific sub-role).
 *
 * Zero em dashes.
 */
import { q, q1, pool } from "../pool.js";
import { ForbiddenError, type Actor } from "../db.js";
import { actorOwns, getEvent } from "./events.js";
import { EVENT_ROLES, INVITABLE_EVENT_ROLES, isEventRole, type EventRole } from "../lib/eventRoles.js";

export { EVENT_ROLES, INVITABLE_EVENT_ROLES, isEventRole, type EventRole };

export type EventMemberStatus = "invited" | "active" | "declined" | "removed";

export type EventMemberRow = {
  id: string;
  event_id: string;
  user_id: string | null;
  organization_id: string | null;
  vendor_id: string | null;
  event_vendor_id: string | null;
  role: EventRole;
  status: EventMemberStatus;
  invited_by: string | null;
  invitation_id: string | null;
  permission_overrides: unknown;
  invited_at: string | null;
  joined_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
};

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/**
 * Resolve the actor's effective role on an event. Returns null for "no
 * access" rather than throwing, so callers decide read vs write behavior.
 * Admins and the event owner always resolve first (cheapest, most common
 * checks); an explicit active event_members row is checked next; a legacy
 * event_vendors attachment with no explicit row falls back to vendor_owner.
 */
export async function getEventRole(actor: Actor, eventId: string): Promise<EventRole | null> {
  if (isAdmin(actor)) return "event_owner";
  if (await actorOwns(actor, eventId)) return "event_owner";
  const member = await q1<{ role: EventRole }>(
    `select role from event_members where event_id = $1 and user_id = $2 and status = 'active'`,
    [eventId, actor.user.id],
  );
  if (member) return member.role;
  if (actor.org?.id) {
    const attached = await q1<{ ok: boolean }>(
      `select true as ok from event_vendors where event_id = $1 and organization_id = $2`,
      [eventId, actor.org.id],
    );
    if (attached?.ok) return "vendor_owner";
  }
  return null;
}

/** Assert the actor holds one of the allowed roles on this event, or throw. */
export async function requireEventRole(
  actor: Actor,
  eventId: string,
  allowed: EventRole[],
): Promise<EventRole> {
  const role = await getEventRole(actor, eventId);
  if (!role || !allowed.includes(role)) {
    throw new ForbiddenError("insufficient event role");
  }
  return role;
}

/** The full member roster (any actor with event access may view it). */
export async function listEventMembers(actor: Actor, eventId: string): Promise<EventMemberRow[]> {
  await getEvent(actor, eventId);
  return q<EventMemberRow>(
    `select * from event_members
      where event_id = $1 and status <> 'removed'
      order by case role when 'event_owner' then 0 else 1 end asc, created_at asc`,
    [eventId],
  );
}

export type UpsertMemberInput = {
  user_id: string;
  organization_id?: string | null;
  vendor_id?: string | null;
  event_vendor_id?: string | null;
  role: EventRole;
  invited_by?: string | null;
  invitation_id?: string | null;
  status?: EventMemberStatus;
};

/**
 * Create or reactivate a member row for (event_id, user_id). Idempotent:
 * re-inviting/re-accepting updates role/status in place rather than creating
 * a duplicate row (unique(event_id, user_id) backs this). Internal helper
 * used by the invitation-accept flow and by event creation (to seed the
 * owner's own roster row); not exposed as a direct "add without invite"
 * write path in Phase A.
 */
export async function upsertEventMember(
  input: UpsertMemberInput & { event_id: string },
): Promise<EventMemberRow> {
  if (!isEventRole(input.role)) throw new ForbiddenError("invalid event role");
  const status = input.status ?? "active";
  const row = await q1<EventMemberRow>(
    `insert into event_members
       (event_id, user_id, organization_id, vendor_id, event_vendor_id, role, status,
        invited_by, invitation_id, invited_at, joined_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,
             case when $7 = 'invited' then now() else null end,
             case when $7 = 'active' then now() else null end)
     on conflict (event_id, user_id) do update set
        organization_id = excluded.organization_id,
        vendor_id = coalesce(excluded.vendor_id, event_members.vendor_id),
        event_vendor_id = coalesce(excluded.event_vendor_id, event_members.event_vendor_id),
        role = excluded.role,
        status = excluded.status,
        invited_by = coalesce(excluded.invited_by, event_members.invited_by),
        invitation_id = coalesce(excluded.invitation_id, event_members.invitation_id),
        joined_at = case when excluded.status = 'active' and event_members.joined_at is null
                         then now() else event_members.joined_at end,
        removed_at = case when excluded.status <> 'removed' then null else event_members.removed_at end,
        updated_at = now()
     returning *`,
    [
      input.event_id,
      input.user_id,
      input.organization_id ?? null,
      input.vendor_id ?? null,
      input.event_vendor_id ?? null,
      input.role,
      status,
      input.invited_by ?? null,
      input.invitation_id ?? null,
    ],
  );
  return row as EventMemberRow;
}

/** Soft-remove a member (owner-only). The event owner's own row cannot be removed this way. */
export async function removeEventMember(
  actor: Actor,
  eventId: string,
  memberId: string,
): Promise<void> {
  await requireEventRole(actor, eventId, ["event_owner"]);
  const target = await q1<EventMemberRow>(
    `select * from event_members where id = $1 and event_id = $2`,
    [memberId, eventId],
  );
  if (!target) throw new ForbiddenError("member not found on this event");
  if (target.role === "event_owner") {
    throw new ForbiddenError("cannot remove the event owner");
  }
  await pool.query(
    `update event_members set status = 'removed', removed_at = now(), updated_at = now()
      where id = $1`,
    [memberId],
  );
}
