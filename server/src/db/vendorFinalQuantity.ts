/**
 * Vendor Final Count / Final Quantity Workflow (Divini Partners 63-section
 * Event Operations spec, Phase A item 7, 2026-08-09).
 *
 * The vendor-side counterpart to db/finalCount.ts (Phase A item 6): a vendor
 * confirms their own execution quantity for their own scope, versioned the
 * same append-only way (a revision never overwrites what was already
 * submitted). discrepancy is computed against the CURRENT authoritative
 * event_final_counts value at submit-time, so it stays visible on every
 * historical version rather than only on the latest one.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { ForbiddenError, type Actor } from "../db.js";
import { getEvent, canManageEvent } from "./events.js";
import { recordEventChange } from "./eventChanges.js";

export type VendorFinalQuantityRow = {
  id: string;
  event_id: string;
  vendor_id: string;
  organization_id: string;
  scope: string;
  version: number;
  quantity: string;
  unit: string;
  notes: string | null;
  discrepancy: string | null;
  submitted_by: string | null;
  created_at: string;
};

/** The submitting actor's own vendor identity (their org's vendors.id), or null. */
async function ownVendorId(actor: Actor): Promise<string | null> {
  if (!actor.org?.id) return null;
  const row = await q1<{ id: string }>(`select id from vendors where organization_id = $1`, [
    actor.org.id,
  ]);
  return row?.id ?? null;
}

export type SubmitQuantityInput = {
  scope: string;
  quantity: number;
  unit?: string | null;
  notes?: string | null;
};

/**
 * Submit (version) a vendor's own final quantity for a scope on this event.
 * Any actor whose org is the attached vendor may submit -- there is no
 * further vendor_owner-vs-vendor_staff distinction enforced yet (both roles
 * currently carry the same org-level write permission everywhere else in
 * this codebase, see the Phase A item 3 report).
 */
export async function submitVendorFinalQuantity(
  actor: Actor,
  eventId: string,
  input: SubmitQuantityInput,
): Promise<VendorFinalQuantityRow> {
  await getEvent(actor, eventId);
  const vendorId = await ownVendorId(actor);
  if (!vendorId) throw new ForbiddenError("no vendor identity for this account");
  const isAttached = await q1<{ ok: boolean }>(
    `select true as ok from event_vendors where event_id = $1 and vendor_id = $2
     union select true from event_members where event_id = $1 and user_id = $3 and status = 'active'
       and role in ('vendor_owner','vendor_staff')
     limit 1`,
    [eventId, vendorId, actor.user.id],
  );
  if (!isAttached?.ok) throw new ForbiddenError("your vendor is not attached to this event");

  const scope = String(input.scope ?? "").trim();
  if (!scope) throw new ForbiddenError("scope required");
  if (typeof input.quantity !== "number" || !Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new ForbiddenError("quantity must be a non-negative number");
  }
  const unit = input.unit?.trim() || "guests";

  const previous = await q1<{ version: number }>(
    `select version from vendor_final_quantities
      where event_id = $1 and vendor_id = $2 and scope = $3
      order by version desc limit 1`,
    [eventId, vendorId, scope],
  );
  const nextVersion = (previous?.version ?? 0) + 1;

  const authoritative = await q1<{ count: number }>(
    `select count from event_final_counts where event_id = $1 order by version desc limit 1`,
    [eventId],
  );
  const discrepancy = authoritative ? input.quantity - Number(authoritative.count) : null;

  const row = await q1<VendorFinalQuantityRow>(
    `insert into vendor_final_quantities
       (event_id, vendor_id, organization_id, scope, version, quantity, unit, notes,
        discrepancy, submitted_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     returning *`,
    [
      eventId,
      vendorId,
      actor.org!.id,
      scope,
      nextVersion,
      input.quantity,
      unit,
      input.notes?.trim() || null,
      discrepancy,
      actor.user.id,
    ],
  );
  const version = row as VendorFinalQuantityRow;

  // Propagate to the owner-side roles who need to see and act on a
  // discrepancy -- deliberately NOT to every active member (that would spam
  // other vendors with a submission that has nothing to do with them).
  await recordEventChange(actor, eventId, {
    category: "attendance",
    field: "vendor_final_quantity",
    old_value: previous ? { scope, version: previous.version } : null,
    new_value: { scope, version: nextVersion, quantity: input.quantity, unit, discrepancy },
    reason: `${scope}: ${input.quantity} ${unit}${discrepancy != null ? ` (discrepancy ${discrepancy > 0 ? "+" : ""}${discrepancy})` : ""}`,
    affected_scopes: ["event_owner", "planner", "finance"],
    requires_acknowledgment: discrepancy != null && discrepancy !== 0,
  }).catch(() => undefined);

  return version;
}

export type ListQuantitiesFilter = {
  vendorId?: string | null;
  scope?: string | null;
};

/**
 * List vendor final quantities for an event. Owner/planner see every
 * vendor's submissions (full oversight, matching the "prominent discrepancy
 * flagging" requirement); any other actor only ever sees their own vendor's
 * rows, mirroring the vendor-vs-vendor quote isolation established
 * elsewhere in this codebase.
 */
export async function listVendorFinalQuantities(
  actor: Actor,
  eventId: string,
  filter?: ListQuantitiesFilter,
): Promise<VendorFinalQuantityRow[]> {
  await getEvent(actor, eventId);
  const isManager = await canManageEvent(actor, eventId);
  const scopedVendorId = isManager ? (filter?.vendorId ?? null) : await ownVendorId(actor);
  if (!isManager && !scopedVendorId) return [];
  return q<VendorFinalQuantityRow>(
    `select * from vendor_final_quantities
      where event_id = $1
        and ($2::uuid is null or vendor_id = $2)
        and ($3::text is null or scope = $3)
      order by scope asc, version desc`,
    [eventId, scopedVendorId, filter?.scope ?? null],
  );
}
