/**
 * Venue Intelligence Addendum (Phase 6) - vendor_event_requirements data-access.
 *
 * One row per (event, vendor): the vendor declares what they need from a given
 * event. needs_guest_list / needs_headcount drive the guest-list auto-sync
 * notification (server/src/lib/guestSync.ts); needs_deposit + deposit_gate /
 * payment_gate carry the vendor's gating configuration.
 *
 * Authorization (IDOR-safe), mirroring server/src/db/events.ts:
 *   - read:  any actor who can SEE the event (owner org, client, planner, or a
 *            vendor org attached to the event) may LIST requirements on it. The
 *            client manages the event page and needs to see which vendors are
 *            subscribed, so a read is event-access scoped.
 *   - write: a vendor sets THEIR OWN requirements. The vendor_id supplied must
 *            belong to the actor's organization (vendors.organization_id = the
 *            actor's org), and the actor must be able to see the event. A forged
 *            vendor_id from another tenant is rejected (ForbiddenError) before
 *            any insert / update / delete. Admins / super_admins may act on any.
 *
 * Every write recomputes nothing external; it just upserts the single row.
 */
import { q, q1, pool } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { getEvent } from "./events.js";

export type VendorEventRequirementRow = {
  id: string;
  event_id: string | null;
  vendor_id: string | null;
  needs_guest_list: boolean | null;
  needs_headcount: boolean | null;
  needs_deposit: boolean | null;
  deposit_gate: unknown;
  payment_gate: unknown;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

const SELECT = `select
  id, event_id, vendor_id, needs_guest_list, needs_headcount, needs_deposit,
  deposit_gate, payment_gate, notes, created_by, created_at, updated_at
from vendor_event_requirements`;

function isAdmin(actor: Actor): boolean {
  return actor.user.role === "super_admin" || actor.user.role === "admin";
}

/** Read access piggybacks on event access (throws NotFound / Forbidden). */
async function canSeeEvent(actor: Actor, eventId: string): Promise<void> {
  await getEvent(actor, eventId);
}

/**
 * Validate that the supplied vendor_id belongs to the actor's organization (or
 * the actor is an admin). Rejects a forged / other-tenant vendor id.
 */
async function requireOwnVendor(actor: Actor, vendorId: string): Promise<void> {
  if (isAdmin(actor)) return;
  if (!actor.org?.id) throw new ForbiddenError("no organization for actor");
  const row = await q1<{ ok: boolean }>(
    `select true as ok from vendors where id = $1 and organization_id = $2 limit 1`,
    [vendorId, actor.org.id],
  );
  if (!row?.ok) throw new ForbiddenError("vendor does not belong to your organization");
}

/** Load a requirement row by id or throw NotFound. */
async function loadRow(id: string): Promise<VendorEventRequirementRow> {
  const row = await q1<VendorEventRequirementRow>(`${SELECT} where id = $1`, [id]);
  if (!row) throw new NotFoundError("requirement not found");
  return row;
}

/** List all requirement rows on an event (read = event access). */
export async function listByEvent(
  actor: Actor,
  eventId: string,
): Promise<VendorEventRequirementRow[]> {
  await canSeeEvent(actor, eventId);
  return q<VendorEventRequirementRow>(
    `${SELECT} where event_id = $1 order by created_at asc`,
    [eventId],
  );
}

/**
 * List requirement rows for the actor's OWN vendor org across an event. Lets a
 * vendor see what they configured without exposing other vendors' rows when the
 * vendor is not the event owner. Filtered to the actor's org vendors.
 */
export async function listMineByEvent(
  actor: Actor,
  eventId: string,
): Promise<VendorEventRequirementRow[]> {
  await canSeeEvent(actor, eventId);
  if (isAdmin(actor)) {
    return q<VendorEventRequirementRow>(
      `${SELECT} where event_id = $1 order by created_at asc`,
      [eventId],
    );
  }
  if (!actor.org?.id) return [];
  return q<VendorEventRequirementRow>(
    `${SELECT} r
      where r.event_id = $1
        and r.vendor_id in (select id from vendors where organization_id = $2)
      order by r.created_at asc`,
    [eventId, actor.org.id],
  );
}

export type RequirementInput = {
  needs_guest_list?: boolean | null;
  needs_headcount?: boolean | null;
  needs_deposit?: boolean | null;
  deposit_gate?: unknown;
  payment_gate?: unknown;
  notes?: string | null;
};

function jsonOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}

/**
 * Upsert the vendor's requirements for an event. The (event_id, vendor_id) pair
 * is unique, so this sets or updates the single row. The actor must own the
 * vendor and be able to see the event.
 */
export async function upsert(
  actor: Actor,
  eventId: string,
  vendorId: string,
  input: RequirementInput,
): Promise<VendorEventRequirementRow> {
  await canSeeEvent(actor, eventId);
  await requireOwnVendor(actor, vendorId);
  const row = await q1<VendorEventRequirementRow>(
    `insert into vendor_event_requirements
       (event_id, vendor_id, needs_guest_list, needs_headcount, needs_deposit,
        deposit_gate, payment_gate, notes, created_by)
     values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)
     on conflict (event_id, vendor_id) do update set
        needs_guest_list = coalesce(excluded.needs_guest_list, vendor_event_requirements.needs_guest_list),
        needs_headcount = coalesce(excluded.needs_headcount, vendor_event_requirements.needs_headcount),
        needs_deposit = coalesce(excluded.needs_deposit, vendor_event_requirements.needs_deposit),
        deposit_gate = coalesce(excluded.deposit_gate, vendor_event_requirements.deposit_gate),
        payment_gate = coalesce(excluded.payment_gate, vendor_event_requirements.payment_gate),
        notes = coalesce(excluded.notes, vendor_event_requirements.notes),
        updated_at = now()
     returning *`,
    [
      eventId,
      vendorId,
      input.needs_guest_list ?? false,
      input.needs_headcount ?? false,
      input.needs_deposit ?? false,
      jsonOrNull(input.deposit_gate),
      jsonOrNull(input.payment_gate),
      input.notes ?? null,
      actor.user.id,
    ],
  );
  return row as VendorEventRequirementRow;
}

/** Patch a requirement row by id (owner of the vendor only). */
export async function update(
  actor: Actor,
  id: string,
  patch: RequirementInput,
): Promise<VendorEventRequirementRow> {
  const existing = await loadRow(id);
  if (existing.event_id) await canSeeEvent(actor, existing.event_id);
  if (existing.vendor_id) await requireOwnVendor(actor, existing.vendor_id);
  const row = await q1<VendorEventRequirementRow>(
    `update vendor_event_requirements set
        needs_guest_list = coalesce($2, needs_guest_list),
        needs_headcount = coalesce($3, needs_headcount),
        needs_deposit = coalesce($4, needs_deposit),
        deposit_gate = coalesce($5::jsonb, deposit_gate),
        payment_gate = coalesce($6::jsonb, payment_gate),
        notes = coalesce($7, notes),
        updated_at = now()
      where id = $1
      returning *`,
    [
      id,
      patch.needs_guest_list ?? null,
      patch.needs_headcount ?? null,
      patch.needs_deposit ?? null,
      jsonOrNull(patch.deposit_gate),
      jsonOrNull(patch.payment_gate),
      patch.notes ?? null,
    ],
  );
  return row as VendorEventRequirementRow;
}

/** Delete a requirement row by id (owner of the vendor only). */
export async function remove(actor: Actor, id: string): Promise<void> {
  const existing = await loadRow(id);
  if (existing.event_id) await canSeeEvent(actor, existing.event_id);
  if (existing.vendor_id) await requireOwnVendor(actor, existing.vendor_id);
  await pool.query(`delete from vendor_event_requirements where id = $1`, [id]);
}

/**
 * Internal (non-actor) lookup used by the guest-sync hook: vendors that opted in
 * to guest-list and / or headcount updates on an event. No actor scoping because
 * this runs server-side from a guest mutation that has already been authorized.
 */
export async function subscribedVendorIdsForEvent(eventId: string): Promise<string[]> {
  const rows = await q<{ vendor_id: string | null }>(
    `select vendor_id from vendor_event_requirements
      where event_id = $1
        and (needs_guest_list is true or needs_headcount is true)`,
    [eventId],
  ).catch(() => [] as Array<{ vendor_id: string | null }>);
  return rows.map((r) => r.vendor_id).filter((x): x is string => !!x);
}
