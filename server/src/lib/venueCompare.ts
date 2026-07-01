/**
 * Friction Elimination - UPGRADE 3 Venue Comparison Engine (cost math).
 *
 * FRICTION-ELIMINATION-ADDENDUM.md U3 asks the comparison to show not just the
 * rental fee but an ESTIMATED TOTAL COST: rental + F&B minimum + rough
 * vendor/AV allowances. This module is the single source of truth for that math.
 *
 * Everything here is PURE and DETERMINISTIC: no DB work, no clock, no
 * randomness. The repo (server/src/db/venue-compare.ts) supplies the rows it has
 * read, this module turns them into line items + a total and into a normalized
 * side-by-side comparison row. Pure means unit-testable and means two identical
 * inputs always produce the identical estimate.
 *
 * The estimate is intentionally a HEURISTIC, not a quote. AV and per-guest
 * allowances are added only when the venue does NOT already include them, so the
 * total reflects the likely out-of-pocket spend at a venue, which is exactly the
 * apples-to-apples number the comparison is for.
 */

/** The subset of venue_compare_attrs the estimate reads. All optional. */
export interface CompareAttrs {
  rental_cost?: number | string | null;
  av_included?: boolean | null;
  tables_included?: boolean | null;
  furniture_included?: boolean | null;
  fnb_minimum?: number | string | null;
  security_required?: boolean | null;
  insurance_required?: boolean | null;
  setup_window?: unknown;
  teardown_window?: unknown;
  extras?: unknown;
}

/** The subset of venue_twin columns the estimate reads (capacity fallback). */
export interface CompareTwin {
  capacity?: number | null;
  indoor_capacity?: number | null;
  outdoor_capacity?: number | null;
  parking_capacity?: number | null;
  security_requirements?: unknown;
  insurance_requirements?: unknown;
  install_windows?: unknown;
  removal_windows?: unknown;
}

/** Inputs that scale the estimate (currently the expected guest count). */
export interface EstimateInputs {
  guestCount?: number | null;
}

/** A single named line in the estimate. */
export interface CostLineItem {
  key: string;
  label: string;
  amount: number;
}

/** The result of estimateTotalCost: the total + its line items + the basis. */
export interface CostEstimate {
  total: number;
  lineItems: CostLineItem[];
  guestCount: number;
  /** true when the estimate had to assume defaults (e.g. no guest count given). */
  assumed: boolean;
}

// ---- Heuristic constants (deterministic, documented) -----------------------

/** Rough AV/production allowance added only when AV is NOT included. */
export const AV_ALLOWANCE = 2500;
/** Rough per-guest vendor allowance (catering staff, rentals, etc.) when no F&B minimum covers it. */
export const VENDOR_PER_GUEST = 45;
/** Rough per-guest tables/furniture allowance when the venue does not include them. */
export const FURNITURE_PER_GUEST = 12;
/** Flat security allowance added when the venue requires (paid) security. */
export const SECURITY_ALLOWANCE = 1200;
/** Flat event-insurance allowance added when the venue requires insurance. */
export const INSURANCE_ALLOWANCE = 350;
/** Fallback guest count when no input and no capacity are available. */
export const DEFAULT_GUEST_COUNT = 100;

/** Coerce a numeric-ish value (number, numeric string from pg) to a number or 0. */
function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Round to whole currency units (deterministic). */
function round(n: number): number {
  return Math.round(n);
}

/**
 * Estimate the total cost of holding an event at a venue. Pure + deterministic.
 *
 * Line items:
 *   - rental: the venue's base rental_cost (0 when unknown).
 *   - fnb_minimum: the venue's F&B minimum spend (a floor the client will pay).
 *   - vendor allowance: per-guest vendor spend; reduced by the F&B minimum
 *     already counted so we do not double-count catering.
 *   - av allowance: added only when AV is NOT included.
 *   - furniture allowance: per-guest, added only when tables AND furniture are
 *     not both included.
 *   - security / insurance: flat allowances when the venue requires them.
 */
export function estimateTotalCost(
  attrs: CompareAttrs | null | undefined,
  twin: CompareTwin | null | undefined,
  inputs?: EstimateInputs | null,
): CostEstimate {
  const a = attrs ?? {};
  const t = twin ?? {};

  // Resolve the guest count: explicit input first, then venue capacity, then default.
  let assumed = false;
  let guestCount = num(inputs?.guestCount);
  if (guestCount <= 0) {
    const cap = num(t.capacity) || num(t.indoor_capacity) || num(t.outdoor_capacity);
    guestCount = cap > 0 ? cap : DEFAULT_GUEST_COUNT;
    assumed = true;
  }

  const lineItems: CostLineItem[] = [];

  const rental = num(a.rental_cost);
  lineItems.push({ key: "rental", label: "Rental / facility fee", amount: round(rental) });

  const fnbMin = num(a.fnb_minimum);
  if (fnbMin > 0) {
    lineItems.push({ key: "fnb_minimum", label: "Food and beverage minimum", amount: round(fnbMin) });
  }

  // Per-guest vendor allowance, net of the F&B minimum already counted (never below 0).
  const vendorGross = guestCount * VENDOR_PER_GUEST;
  const vendorNet = Math.max(0, vendorGross - fnbMin);
  if (vendorNet > 0) {
    lineItems.push({
      key: "vendor_allowance",
      label: "Vendor allowance (est.)",
      amount: round(vendorNet),
    });
  }

  if (a.av_included !== true) {
    lineItems.push({ key: "av_allowance", label: "AV / production allowance (est.)", amount: AV_ALLOWANCE });
  }

  if (a.tables_included !== true || a.furniture_included !== true) {
    lineItems.push({
      key: "furniture_allowance",
      label: "Tables / furniture allowance (est.)",
      amount: round(guestCount * FURNITURE_PER_GUEST),
    });
  }

  if (a.security_required === true) {
    lineItems.push({ key: "security", label: "Security (est.)", amount: SECURITY_ALLOWANCE });
  }

  if (a.insurance_required === true) {
    lineItems.push({ key: "insurance", label: "Event insurance (est.)", amount: INSURANCE_ALLOWANCE });
  }

  const total = lineItems.reduce((sum, li) => sum + li.amount, 0);
  return { total: round(total), lineItems, guestCount, assumed };
}

// ---- Normalized comparison row ---------------------------------------------

/** The minimal venue shape buildComparisonRow needs. */
export interface CompareVenue {
  id: string;
  name?: string | null;
  city?: string | null;
  region?: string | null;
  venue_type?: string | null;
  capacity?: number | null;
  review_score?: number | string | null;
}

/** One normalized, side-by-side comparison row. */
export interface ComparisonRow {
  venueId: string;
  name: string | null;
  location: string | null;
  venueType: string | null;
  capacity: number | null;
  indoorCapacity: number | null;
  outdoorCapacity: number | null;
  parkingCapacity: number | null;
  reviewScore: number | null;
  avIncluded: boolean | null;
  tablesIncluded: boolean | null;
  furnitureIncluded: boolean | null;
  securityRequired: boolean | null;
  insuranceRequired: boolean | null;
  fnbMinimum: number | null;
  rentalCost: number | null;
  vendorRestrictionCount: number;
  setupWindow: unknown;
  teardownWindow: unknown;
  extras: unknown;
  estimate: CostEstimate;
}

/** Coerce a numeric-ish to a number, or null when absent. */
function numOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerce a boolean-ish to boolean or null (preserve "unknown"). */
function boolOrNull(v: boolean | null | undefined): boolean | null {
  if (v === null || v === undefined) return null;
  return Boolean(v);
}

/** Join city + region into a single location string (or null). */
function joinLocation(city?: string | null, region?: string | null): string | null {
  const parts = [city, region].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  return parts.length ? parts.join(", ") : null;
}

/**
 * Build the normalized comparison row from the venue, its twin, its compare
 * attrs, and a precomputed restriction count. Pure + deterministic. Twin and
 * attrs may be null when the venue has not filled them in yet; the row degrades
 * gracefully (nulls) and still carries an estimate.
 */
export function buildComparisonRow(
  venue: CompareVenue,
  twin: CompareTwin | null | undefined,
  attrs: CompareAttrs | null | undefined,
  restrictionsCount: number,
  inputs?: EstimateInputs | null,
): ComparisonRow {
  const t = twin ?? {};
  const a = attrs ?? {};
  return {
    venueId: venue.id,
    name: venue.name ?? null,
    location: joinLocation(venue.city, venue.region),
    venueType: venue.venue_type ?? null,
    capacity: numOrNull(t.capacity) ?? numOrNull(venue.capacity),
    indoorCapacity: numOrNull(t.indoor_capacity),
    outdoorCapacity: numOrNull(t.outdoor_capacity),
    parkingCapacity: numOrNull(t.parking_capacity),
    reviewScore: numOrNull(venue.review_score),
    avIncluded: boolOrNull(a.av_included),
    tablesIncluded: boolOrNull(a.tables_included),
    furnitureIncluded: boolOrNull(a.furniture_included),
    securityRequired: boolOrNull(a.security_required),
    insuranceRequired: boolOrNull(a.insurance_required),
    fnbMinimum: numOrNull(a.fnb_minimum),
    rentalCost: numOrNull(a.rental_cost),
    vendorRestrictionCount: Number.isFinite(restrictionsCount) ? restrictionsCount : 0,
    setupWindow: a.setup_window ?? t.install_windows ?? null,
    teardownWindow: a.teardown_window ?? t.removal_windows ?? null,
    extras: a.extras ?? null,
    estimate: estimateTotalCost(a, t, inputs),
  };
}
