/**
 * Venue Intelligence - Vendor Readiness Score (Phase 4).
 *
 * VENUE-INTELLIGENCE-ADDENDUM.md ("Engines" - vendorReadiness.ts) positions the
 * Vendor Readiness Score (0-100) as the signal that feeds marketplace ranking:
 * the more responsive, complete, compliant, and proven a vendor is, the higher
 * they surface. This module is the single source of truth for that score.
 *
 * `computeVendorReadiness` is PURE: it does no DB work, takes a bag of signals,
 * and returns an integer 0-100. The vendor-readiness repo
 * (server/src/db/vendor-readiness.ts) supplies the signals and persists the
 * result on every write, so the stored score always reflects current data and
 * the function stays unit-testable in isolation.
 *
 * `marketplaceRankingScore` combines that readiness score with a venue's
 * preferred-vendor tier into a single ranking number, exported for the
 * marketplace search/ranking code to plug in (the lead wires it into
 * server/src/db/marketplace.ts ordering).
 *
 * Scoring (ten weighted factors summing to 100). Each factor is a normalized
 * signal multiplied by its weight, so partial credit is possible (unlike the
 * all-or-nothing Quote Readiness Score in venueTwin.ts):
 *   - response speed ........... 14  (0-1, 1 = fastest)
 *   - quote speed .............. 14  (0-1, 1 = fastest)
 *   - approval rate ............ 12  (0-1)
 *   - win rate ................. 12  (0-1)
 *   - profile completeness ..... 12  (0-1)
 *   - reviews score ............ 12  (0-5, normalized /5)
 *   - completion history ....... 12  (0-1)
 *   - insurance uploaded ....... 06  (boolean)
 *   - w9 uploaded .............. 06  (boolean)
 *   - (the two compliance flags together carry the remaining weight)
 * Total = 14+14+12+12+12+12+12+6+6 = 100.
 */

/** Raw signals the score reads. All optional; missing = 0 (worst case). */
export interface VendorReadinessSignals {
  response_speed?: number | null; // 0-1
  quote_speed?: number | null; // 0-1
  approval_rate?: number | null; // 0-1
  win_rate?: number | null; // 0-1
  profile_completeness?: number | null; // 0-1
  reviews_score?: number | null; // 0-5
  completion_history?: number | null; // 0-1
  insurance_uploaded?: boolean | null;
  w9_uploaded?: boolean | null;
}

/** A readiness factor: its weight and the weight it earned (for nudges). */
export interface VendorReadinessFactor {
  key: string;
  label: string;
  weight: number;
  earned: number;
}

/** The exported weights (sum to 100), in display order. */
export const VENDOR_READINESS_WEIGHTS: { key: string; label: string; weight: number }[] = [
  { key: "response_speed", label: "Response speed", weight: 14 },
  { key: "quote_speed", label: "Quote turnaround speed", weight: 14 },
  { key: "approval_rate", label: "Quote approval rate", weight: 12 },
  { key: "win_rate", label: "Win rate", weight: 12 },
  { key: "profile_completeness", label: "Profile completeness", weight: 12 },
  { key: "reviews_score", label: "Reviews score", weight: 12 },
  { key: "completion_history", label: "Completion history", weight: 12 },
  { key: "insurance_uploaded", label: "Insurance on file", weight: 6 },
  { key: "w9_uploaded", label: "W-9 on file", weight: 6 },
];

/** Clamp a value to [0, 1]; null/NaN -> 0. */
function unit(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Normalize a 0-5 review score to [0, 1]; null/NaN -> 0. */
function reviewUnit(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n / 5));
}

/** A boolean flag as 0 or 1. */
function flag(v: boolean | null | undefined): number {
  return v ? 1 : 0;
}

/**
 * Per-factor breakdown. Pure. Useful for a vendor-facing "improve your score"
 * nudge; computeVendorReadiness sums the earned weights.
 */
export function vendorReadinessBreakdown(
  signals: VendorReadinessSignals,
): VendorReadinessFactor[] {
  const normalized: Record<string, number> = {
    response_speed: unit(signals.response_speed),
    quote_speed: unit(signals.quote_speed),
    approval_rate: unit(signals.approval_rate),
    win_rate: unit(signals.win_rate),
    profile_completeness: unit(signals.profile_completeness),
    reviews_score: reviewUnit(signals.reviews_score),
    completion_history: unit(signals.completion_history),
    insurance_uploaded: flag(signals.insurance_uploaded),
    w9_uploaded: flag(signals.w9_uploaded),
  };
  return VENDOR_READINESS_WEIGHTS.map((w) => ({
    key: w.key,
    label: w.label,
    weight: w.weight,
    earned: Math.round((normalized[w.key] ?? 0) * w.weight * 100) / 100,
  }));
}

/**
 * Vendor Readiness Score, 0-100. Pure: no DB calls. Sums the earned weight of
 * each factor and clamps to [0, 100].
 */
export function computeVendorReadiness(signals: VendorReadinessSignals): number {
  const total = vendorReadinessBreakdown(signals).reduce((sum, f) => sum + f.earned, 0);
  return Math.max(0, Math.min(100, Math.round(total)));
}

// ---- Marketplace ranking ----------------------------------------------------

/** Preferred-vendor tiers, strongest first. Mirrors the schema CHECK. */
export type PreferredTier = "exclusive" | "preferred" | "recommended" | "approved";

/**
 * A flat bonus (added to the 0-100 readiness score) for each preferred tier a
 * venue has assigned a vendor. Exclusive ranks above preferred, which ranks
 * above recommended, which ranks above approved. Untiered vendors get 0.
 */
export const PREFERRED_TIER_BONUS: Record<PreferredTier, number> = {
  exclusive: 40,
  preferred: 30,
  recommended: 20,
  approved: 10,
};

/** The shape marketplaceRankingScore needs from a vendor candidate. */
export interface MarketplaceRankingVendor {
  /** Stored Vendor Readiness Score (0-100), or null if never computed. */
  readiness_score?: number | null;
  /**
   * The venue's preferred tier for this vendor in the current ranking context,
   * or null/undefined when the vendor is not on the venue's preferred list (or
   * when ranking is not venue-scoped).
   */
  preferred_tier?: PreferredTier | string | null;
}

/** True when a string is a recognized preferred tier. */
function isPreferredTier(v: unknown): v is PreferredTier {
  return (
    v === "exclusive" || v === "preferred" || v === "recommended" || v === "approved"
  );
}

/**
 * Combine the vendor readiness score with the venue's preferred tier into a
 * single ranking number (higher ranks first). Pure. The lead plugs this into
 * the marketplace ranking: compute it per candidate then sort descending.
 *
 * readiness contributes 0-100; the preferred tier adds a flat bonus on top so a
 * venue's curated vendors always outrank equally-ready strangers, and stronger
 * tiers outrank weaker ones. Result is unbounded above 100 by design (the tier
 * bonus is additive) but deterministic and comparable.
 */
export function marketplaceRankingScore(vendor: MarketplaceRankingVendor): number {
  const readiness = (() => {
    const n = Number(vendor.readiness_score);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  })();
  const tierBonus = isPreferredTier(vendor.preferred_tier)
    ? PREFERRED_TIER_BONUS[vendor.preferred_tier]
    : 0;
  return readiness + tierBonus;
}
