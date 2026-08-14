/**
 * Unit-aware vendor final quantity comparison semantics (Divini Partners
 * 63-section Event Operations spec, Final Event Schedule / Execution Packet
 * completion phase, 2026-08-09).
 *
 * Fixes a deferred gap from Phase A item 7: vendor_final_quantities
 * originally compared EVERY vendor's quantity directly against the event's
 * guest final count, which is only valid for headcount-proportional scopes
 * (meals, chairs). A security officer count, a technician count, a hotel
 * room count, are not the same unit as guest count and a raw subtraction
 * against it is not a real discrepancy -- it is noise.
 *
 * Pure, no DB, no config -- matches the lib/pricingMath.ts / lib/quoteMath.ts
 * / lib/eventRoles.ts convention so this stays independently unit-testable.
 * The DB layer (db/vendorFinalQuantity.ts) resolves the actual reference
 * NUMBER for a comparison_type (querying event_final_counts, summing quote
 * line items, etc.) and hands it to computeComparison here; nothing in this
 * file talks to the database.
 *
 * Zero em dashes.
 */

export type ComparisonType =
  | "event_final_count"
  | "awarded_quantity"
  | "contract_quantity"
  | "scope_requirement"
  | "custom_expected_quantity"
  | "none";

export const COMPARISON_TYPES: ComparisonType[] = [
  "event_final_count",
  "awarded_quantity",
  "contract_quantity",
  "scope_requirement",
  "custom_expected_quantity",
  "none",
];

const COMPARISON_TYPE_SET = new Set<string>(COMPARISON_TYPES);
export function isComparisonType(v: unknown): v is ComparisonType {
  return typeof v === "string" && COMPARISON_TYPE_SET.has(v);
}

/**
 * Types with no structured source of truth in this schema for the expected
 * number (no contracts table, no per-bid structured quantity requirement).
 * The caller MUST supply custom_expected_quantity for these -- there is no
 * auto-resolution path, so silently proceeding without one would either
 * fabricate a number or produce a misleading "unresolved" when the real
 * problem is the caller never gave the system anything to compare against.
 */
export const COMPARISON_TYPES_REQUIRING_EXPLICIT_VALUE: ComparisonType[] = [
  "contract_quantity",
  "scope_requirement",
  "custom_expected_quantity",
];

export type DiscrepancyStatus = "not_applicable" | "unresolved" | "match" | "over" | "under";

export type ComparisonResult = {
  expected_quantity: number | null;
  discrepancy: number | null;
  discrepancy_status: DiscrepancyStatus;
};

/**
 * Combine a resolved reference value + ratio with the submitted quantity.
 * referenceValue is null when comparison_type called for a comparison but
 * the underlying data does not exist yet (e.g. no final count has been set
 * on the event) -- that is reported as "unresolved", distinct from "none"
 * (comparison_type = 'none', no comparison was ever requested).
 */
export function computeComparison(
  comparisonType: ComparisonType,
  referenceValue: number | null,
  ratio: number,
  quantity: number,
): ComparisonResult {
  if (comparisonType === "none") {
    return { expected_quantity: null, discrepancy: null, discrepancy_status: "not_applicable" };
  }
  if (referenceValue == null || !Number.isFinite(referenceValue)) {
    return { expected_quantity: null, discrepancy: null, discrepancy_status: "unresolved" };
  }
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  // Round to 2dp: quantities are typically whole units, and floating-point
  // multiplication (e.g. 400 * 1.15) otherwise leaks artifacts like
  // 459.99999999999994 into a number a human is meant to read.
  const expected_quantity = Math.round(referenceValue * safeRatio * 100) / 100;
  const discrepancy = Math.round((quantity - expected_quantity) * 100) / 100;
  const discrepancy_status: DiscrepancyStatus =
    discrepancy === 0 ? "match" : discrepancy > 0 ? "over" : "under";
  return { expected_quantity, discrepancy, discrepancy_status };
}
