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
import {
  computeComparison,
  isComparisonType,
  COMPARISON_TYPES_REQUIRING_EXPLICIT_VALUE,
  type ComparisonType,
  type DiscrepancyStatus,
} from "../lib/quantityComparison.js";

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
  comparison_type: ComparisonType | null;
  comparison_reference: unknown;
  comparison_ratio: string;
  expected_quantity: string | null;
  discrepancy_status: DiscrepancyStatus | null;
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
  /** Defaults to "none" -- a discrepancy is only ever computed when the
   *  submitter explicitly opts into a semantically valid comparison. */
  comparison_type?: string | null;
  /** Multiplier applied to the resolved reference value, e.g. 1.15 for
   *  "bar servings run 15% over guest count". Defaults to 1. */
  comparison_ratio?: number | null;
  /** Required for contract_quantity / scope_requirement /
   *  custom_expected_quantity -- there is no structured source for these in
   *  this schema, so the caller must supply the number being compared
   *  against rather than the system inventing or silently skipping it. */
  custom_expected_quantity?: number | null;
};

/**
 * Resolve the reference NUMBER for a comparison_type from real stored data.
 * Returns null when the comparison was requested but nothing to compare
 * against exists yet (e.g. no final count set) -- computeComparison turns
 * that into an "unresolved" status rather than a fabricated discrepancy.
 */
async function resolveReference(
  comparisonType: ComparisonType,
  eventId: string,
  vendorId: string,
  customValue: number | null,
): Promise<{ value: number | null; reference: Record<string, unknown> | null }> {
  if (comparisonType === "event_final_count") {
    const row = await q1<{ version: number; count: number }>(
      `select version, count from event_final_counts where event_id = $1 order by version desc limit 1`,
      [eventId],
    );
    return row
      ? { value: Number(row.count), reference: { source: "event_final_count", version: row.version } }
      : { value: null, reference: { source: "event_final_count" } };
  }
  if (comparisonType === "awarded_quantity") {
    // Sum the quantity fields across this vendor's own accepted/converted
    // quote line items for this event -- real stored data, not fabricated.
    const rows = await q<{ line_items: unknown }>(
      `select line_items from quotes
        where event_id = $1 and vendor_id = $2 and status in ('accepted','converted')`,
      [eventId, vendorId],
    );
    let total = 0;
    let found = false;
    for (const r of rows) {
      const items = Array.isArray(r.line_items) ? r.line_items : [];
      for (const li of items) {
        if (li && typeof li === "object") {
          const q = (li as Record<string, unknown>).quantity;
          if (typeof q === "number") {
            total += q;
            found = true;
          }
        }
      }
    }
    return found
      ? { value: total, reference: { source: "awarded_quantity", quote_count: rows.length } }
      : { value: null, reference: { source: "awarded_quantity" } };
  }
  // contract_quantity / scope_requirement / custom_expected_quantity: the
  // caller-supplied value IS the reference -- validated as present before
  // this function is ever called (see submitVendorFinalQuantity below).
  return {
    value: customValue,
    reference: { source: comparisonType, custom: true },
  };
}

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

  const comparisonType: ComparisonType = isComparisonType(input.comparison_type)
    ? input.comparison_type
    : "none";
  const ratio =
    typeof input.comparison_ratio === "number" && input.comparison_ratio > 0
      ? input.comparison_ratio
      : 1;
  if (
    COMPARISON_TYPES_REQUIRING_EXPLICIT_VALUE.includes(comparisonType) &&
    typeof input.custom_expected_quantity !== "number"
  ) {
    throw new ForbiddenError(
      `comparison_type "${comparisonType}" requires custom_expected_quantity -- there is no structured source for it`,
    );
  }

  const previous = await q1<{ version: number }>(
    `select version from vendor_final_quantities
      where event_id = $1 and vendor_id = $2 and scope = $3
      order by version desc limit 1`,
    [eventId, vendorId, scope],
  );
  const nextVersion = (previous?.version ?? 0) + 1;

  const { value: referenceValue, reference } = await resolveReference(
    comparisonType,
    eventId,
    vendorId,
    typeof input.custom_expected_quantity === "number" ? input.custom_expected_quantity : null,
  );
  const comparison = computeComparison(comparisonType, referenceValue, ratio, input.quantity);

  const row = await q1<VendorFinalQuantityRow>(
    `insert into vendor_final_quantities
       (event_id, vendor_id, organization_id, scope, version, quantity, unit, notes,
        discrepancy, submitted_by, comparison_type, comparison_reference, comparison_ratio,
        expected_quantity, discrepancy_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
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
      comparison.discrepancy,
      actor.user.id,
      comparisonType,
      comparisonType === "none" ? null : JSON.stringify(reference),
      ratio,
      comparison.expected_quantity,
      comparison.discrepancy_status,
    ],
  );
  const version = row as VendorFinalQuantityRow;

  // Propagate to the owner-side roles who need to see and act on a
  // discrepancy -- deliberately NOT to every active member (that would spam
  // other vendors with a submission that has nothing to do with them). Only
  // a real, resolved, non-zero discrepancy requires acknowledgment -- an
  // "unresolved" or "not_applicable" comparison is not something anyone
  // needs to act on yet.
  await recordEventChange(actor, eventId, {
    category: "attendance",
    field: "vendor_final_quantity",
    old_value: previous ? { scope, version: previous.version } : null,
    new_value: {
      scope,
      version: nextVersion,
      quantity: input.quantity,
      unit,
      discrepancy: comparison.discrepancy,
      discrepancy_status: comparison.discrepancy_status,
    },
    reason:
      `${scope}: ${input.quantity} ${unit}` +
      (comparison.discrepancy_status === "over" || comparison.discrepancy_status === "under"
        ? ` (${comparison.discrepancy_status} by ${Math.abs(comparison.discrepancy as number)}, vs ${comparisonType})`
        : ""),
    affected_scopes: ["event_owner", "planner", "finance"],
    requires_acknowledgment:
      comparison.discrepancy_status === "over" || comparison.discrepancy_status === "under",
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
