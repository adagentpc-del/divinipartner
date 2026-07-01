/**
 * Friction Elimination - U9 Vendor Compliance Score + U11 Transparent
 * Preferred Vendor "WHY" reasons.
 *
 * FRICTION-ELIMINATION-ADDENDUM.md upgrades 9 and 11. This module is the pure,
 * DB-free single source of truth for two things:
 *
 *   - computeVendorCompliance(signals) -> 0-100 Vendor Compliance Score plus a
 *     per-factor breakdown. It weights document statuses (insurance, COI, W9),
 *     licenses, reviews, on-time rate, completion history, and per-venue
 *     ratings. The vendor-compliance repo (server/src/db/vendor-compliance.ts)
 *     supplies the signals and persists the result on every write, so the
 *     stored score always reflects current data. The score feeds marketplace
 *     ranking alongside the Phase-4 readiness score.
 *
 *   - buildPreferredWhy(stats) -> string[] of human reasons, e.g.
 *     "83 completed projects", "4.9 average rating", "98% on-time". This is the
 *     "always show WHY" surface (U11): a venue's preferred-vendor list never
 *     just asserts a vendor is preferred, it shows the proof.
 *
 * Both functions are PURE: no DB, no IO, fully unit-testable. This file is
 * ADDITIVE and does NOT import or modify the Phase-4 vendorReadiness.ts.
 *
 * Scoring (eight weighted factors summing to 100). Each factor is a normalized
 * signal multiplied by its weight, so partial credit is possible:
 *   - insurance status ......... 18  (verified=1, pending=.5, expired/missing=0)
 *   - COI status ............... 14  (verified=1, pending=.5, expired/missing=0)
 *   - W9 status ................ 10  (verified=1, pending=.5, missing=0)
 *   - licenses ................. 12  (share of licenses with status 'active'/'valid')
 *   - reviews score ............ 16  (0-5, normalized /5)
 *   - on-time rate ............. 14  (0-1)
 *   - completion history ....... 08  (0+ projects, saturates at 50)
 *   - venue ratings ............ 08  (average of per-venue ratings, 0-5 /5)
 * Total = 18+14+10+12+16+14+8+8 = 100.
 */

// ---- Compliance signals -----------------------------------------------------

/** A document compliance status (insurance / COI / W9). */
export type ComplianceDocStatus =
  | "verified"
  | "pending"
  | "expired"
  | "missing"
  | string
  | null
  | undefined;

/** A single license entry (shape is flexible; only `status` is read for scoring). */
export interface VendorLicense {
  type?: string | null;
  number?: string | null;
  status?: string | null; // 'active' | 'valid' | 'expired' | 'pending' | ...
  expires_at?: string | null;
}

/** A per-venue rating entry. */
export interface VendorVenueRating {
  venue_id?: string | null;
  rating?: number | null; // 0-5
}

/** Raw signals the compliance score reads. All optional; missing = worst case. */
export interface VendorComplianceSignals {
  insurance_status?: ComplianceDocStatus;
  coi_status?: ComplianceDocStatus;
  w9_status?: ComplianceDocStatus;
  licenses?: VendorLicense[] | null;
  reviews_score?: number | null; // 0-5
  on_time_rate?: number | null; // 0-1
  completion_history?: number | null; // count of completed projects
  venue_ratings?: VendorVenueRating[] | null;
}

/** A compliance factor: its weight and the weight it earned (for nudges). */
export interface VendorComplianceFactor {
  key: string;
  label: string;
  weight: number;
  earned: number;
}

/** The exported weights (sum to 100), in display order. */
export const VENDOR_COMPLIANCE_WEIGHTS: { key: string; label: string; weight: number }[] = [
  { key: "insurance_status", label: "Insurance verified", weight: 18 },
  { key: "coi_status", label: "Certificate of insurance", weight: 14 },
  { key: "w9_status", label: "W-9 on file", weight: 10 },
  { key: "licenses", label: "Licenses current", weight: 12 },
  { key: "reviews_score", label: "Reviews score", weight: 16 },
  { key: "on_time_rate", label: "On-time delivery", weight: 14 },
  { key: "completion_history", label: "Completion history", weight: 8 },
  { key: "venue_ratings", label: "Venue ratings", weight: 8 },
];

/** Projects at which completion-history credit saturates to full weight. */
export const COMPLETION_HISTORY_SATURATION = 50;

// ---- Normalizers ------------------------------------------------------------

/** Clamp a value to [0, 1]; null/NaN -> 0. */
function unit(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Normalize a 0-5 score to [0, 1]; null/NaN -> 0. */
function fiveUnit(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n / 5));
}

/** A document status to [0, 1]: verified=1, pending=.5, anything else=0. */
function docUnit(v: ComplianceDocStatus): number {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "verified" || s === "valid" || s === "active" || s === "approved") return 1;
  if (s === "pending" || s === "submitted" || s === "in_review") return 0.5;
  return 0;
}

/** True when a license string-status counts as current. */
function licenseIsCurrent(status: string | null | undefined): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  return s === "active" || s === "valid" || s === "verified" || s === "current";
}

/** Share of licenses that are current, [0, 1]; no licenses -> 0. */
function licensesUnit(list: VendorLicense[] | null | undefined): number {
  if (!Array.isArray(list) || list.length === 0) return 0;
  const current = list.filter((l) => licenseIsCurrent(l?.status)).length;
  return Math.max(0, Math.min(1, current / list.length));
}

/** Completion history to [0, 1], saturating at COMPLETION_HISTORY_SATURATION. */
function completionUnit(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0, Math.min(1, n / COMPLETION_HISTORY_SATURATION));
}

/** Average of per-venue ratings, normalized 0-5 /5 to [0, 1]; none -> 0. */
function venueRatingsUnit(list: VendorVenueRating[] | null | undefined): number {
  if (!Array.isArray(list) || list.length === 0) return 0;
  const vals = list
    .map((r) => Number(r?.rating))
    .filter((n) => Number.isFinite(n));
  if (vals.length === 0) return 0;
  const avg = vals.reduce((s, n) => s + n, 0) / vals.length;
  return Math.max(0, Math.min(1, avg / 5));
}

/** Average of per-venue ratings on the 0-5 scale (for the WHY reasons); null when none. */
export function averageVenueRating(
  list: VendorVenueRating[] | null | undefined,
): number | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const vals = list.map((r) => Number(r?.rating)).filter((n) => Number.isFinite(n));
  if (vals.length === 0) return null;
  return vals.reduce((s, n) => s + n, 0) / vals.length;
}

// ---- Score ------------------------------------------------------------------

/**
 * Per-factor breakdown. Pure. Useful for a vendor-facing "improve your score"
 * nudge; computeVendorCompliance sums the earned weights.
 */
export function vendorComplianceBreakdown(
  signals: VendorComplianceSignals,
): VendorComplianceFactor[] {
  const normalized: Record<string, number> = {
    insurance_status: docUnit(signals.insurance_status),
    coi_status: docUnit(signals.coi_status),
    w9_status: docUnit(signals.w9_status),
    licenses: licensesUnit(signals.licenses),
    reviews_score: fiveUnit(signals.reviews_score),
    on_time_rate: unit(signals.on_time_rate),
    completion_history: completionUnit(signals.completion_history),
    venue_ratings: venueRatingsUnit(signals.venue_ratings),
  };
  return VENDOR_COMPLIANCE_WEIGHTS.map((w) => ({
    key: w.key,
    label: w.label,
    weight: w.weight,
    earned: Math.round((normalized[w.key] ?? 0) * w.weight * 100) / 100,
  }));
}

/**
 * Vendor Compliance Score, 0-100. Pure: no DB calls. Sums the earned weight of
 * each factor and clamps to [0, 100].
 */
export function computeVendorCompliance(signals: VendorComplianceSignals): number {
  const total = vendorComplianceBreakdown(signals).reduce((sum, f) => sum + f.earned, 0);
  return Math.max(0, Math.min(100, Math.round(total)));
}

// ---- Transparent Preferred Vendor "WHY" (U11) -------------------------------

/**
 * The stats buildPreferredWhy reads to assemble human reasons. A superset of
 * the compliance signals plus a couple of optional convenience fields the repo
 * may already have on hand (number of reviews, the computed score). Everything
 * optional: only the reasons backed by real data are returned.
 */
export interface PreferredWhyStats {
  reviews_score?: number | null; // 0-5
  reviews_count?: number | null;
  on_time_rate?: number | null; // 0-1
  completion_history?: number | null; // count of completed projects
  venue_ratings?: VendorVenueRating[] | null;
  insurance_status?: ComplianceDocStatus;
  coi_status?: ComplianceDocStatus;
  w9_status?: ComplianceDocStatus;
  licenses?: VendorLicense[] | null;
  compliance_score?: number | null; // 0-100
}

/** Round a 0-1 rate to a whole-number percent. */
function pct(v: number | null | undefined): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.max(0, Math.min(1, n)) * 100);
}

/** Round a rating to one decimal place (e.g. 4.9). */
function rating1(v: number | null | undefined): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.max(0, Math.min(5, n)) * 10) / 10;
}

function docVerified(v: ComplianceDocStatus): boolean {
  return docUnit(v) >= 1;
}

/**
 * Build the human-readable reasons a vendor is preferred (U11: "always show
 * WHY"). Pure. Returns an ordered list of short proof statements; only reasons
 * with real backing data are included, so a thin vendor returns fewer reasons
 * rather than fabricated ones. Examples:
 *   "83 completed projects", "4.9 average rating (210 reviews)",
 *   "98% on-time", "Insurance + COI verified", "5 active licenses".
 */
export function buildPreferredWhy(stats: PreferredWhyStats): string[] {
  const reasons: string[] = [];

  const completed = Number(stats.completion_history);
  if (Number.isFinite(completed) && completed > 0) {
    reasons.push(
      `${Math.round(completed)} completed ${completed === 1 ? "project" : "projects"}`,
    );
  }

  const rating = rating1(stats.reviews_score);
  if (rating != null && rating > 0) {
    const count = Number(stats.reviews_count);
    if (Number.isFinite(count) && count > 0) {
      reasons.push(
        `${rating} average rating (${Math.round(count)} ${count === 1 ? "review" : "reviews"})`,
      );
    } else {
      reasons.push(`${rating} average rating`);
    }
  }

  const onTime = pct(stats.on_time_rate);
  if (onTime != null && onTime > 0) {
    reasons.push(`${onTime}% on-time`);
  }

  const venueAvg = rating1(averageVenueRating(stats.venue_ratings));
  const venueCount = Array.isArray(stats.venue_ratings) ? stats.venue_ratings.length : 0;
  if (venueAvg != null && venueAvg > 0 && venueCount > 0) {
    reasons.push(
      `${venueAvg} rating across ${venueCount} ${venueCount === 1 ? "venue" : "venues"}`,
    );
  }

  // Compliance documents: collapse insurance + COI into one tidy reason.
  const insOk = docVerified(stats.insurance_status);
  const coiOk = docVerified(stats.coi_status);
  if (insOk && coiOk) {
    reasons.push("Insurance + COI verified");
  } else if (insOk) {
    reasons.push("Insurance verified");
  } else if (coiOk) {
    reasons.push("Certificate of insurance verified");
  }
  if (docVerified(stats.w9_status)) {
    reasons.push("W-9 on file");
  }

  if (Array.isArray(stats.licenses)) {
    const active = stats.licenses.filter((l) => licenseIsCurrent(l?.status)).length;
    if (active > 0) {
      reasons.push(`${active} active ${active === 1 ? "license" : "licenses"}`);
    }
  }

  const score = Number(stats.compliance_score);
  if (Number.isFinite(score) && score >= 90) {
    reasons.push(`${Math.round(score)}/100 compliance score`);
  }

  return reasons;
}
