/**
 * Intelligence Moat - Divini Score (Feature 12).
 *
 * INTELLIGENCE-MOAT-ADDENDUM.md (F12) positions the Divini Score as a
 * proprietary, dynamic 0-100 trust / performance score per entity type. It is
 * the single, branded number that aggregates every other signal the platform
 * already computes: the Phase-4 Vendor Readiness Score, the Friction-phase
 * Vendor Compliance Score, the Venue Quote Readiness Score, reviews, revenue,
 * repeat bookings, on-time delivery, payment history, and more.
 *
 * `computeDiviniScore(entityType, signals)` is PURE: it does no DB work, takes a
 * bag of already-gathered signals, and returns { score 0-100, components }. The
 * divini-score repo (server/src/db/divini-score.ts) supplies the signals (by
 * joining the existing tables) and persists the result in divini_scores on every
 * write, so the stored score always reflects current data and this function
 * stays unit-testable in isolation.
 *
 * Each entity type has its own weighted factor set. The always-on factors for a
 * type sum to 100; the post-event feedback factor (F10) is additive on top and
 * "graceful-absence" (dropped when no feedback exists, with the active set
 * renormalized back to 100 - so a no-feedback entity scores exactly as before).
 * Every active factor is a normalized signal in [0, 1] multiplied by its
 * (renormalized) weight, so partial credit is possible and the breakdown
 * explains the number:
 *
 *   venue   - completeness, responsiveness, revenue performance, reviews,
 *             repeat bookings, compliance, post-event feedback
 *   vendor  - performance, reviews, compliance, on-time, quote accuracy,
 *             response speed, post-event feedback
 *   planner - event success rate, organization, vendor satisfaction, venue
 *             satisfaction, client satisfaction, post-event feedback
 *   sponsor - activation success, engagement, renewal, performance,
 *             post-event feedback
 *   client  - payment history, communication, project completion, reliability,
 *             post-event feedback
 *
 * This file is ADDITIVE and does NOT import or modify the existing scoring libs
 * (vendorReadiness.ts, vendorCompliance.ts, venueTwin.ts). The repo aggregates
 * those scores into the signal bag; this lib only weights and combines them.
 */

// ---- Entity types -----------------------------------------------------------

/** The five entity types a Divini Score can be computed for. */
export type DiviniEntityType = "venue" | "vendor" | "planner" | "sponsor" | "client";

export const DIVINI_ENTITY_TYPES: DiviniEntityType[] = [
  "venue",
  "vendor",
  "planner",
  "sponsor",
  "client",
];

/** True when a string is a recognized Divini entity type. */
export function isDiviniEntityType(v: unknown): v is DiviniEntityType {
  return typeof v === "string" && (DIVINI_ENTITY_TYPES as string[]).includes(v);
}

// ---- Signals ----------------------------------------------------------------

/**
 * The full signal bag. All fields optional; missing = worst case (0). Each entity
 * type only reads the factors in its weight set, so a venue ignores client-only
 * fields and vice versa. Values are pre-normalized by the repo where noted.
 */
export interface DiviniSignals {
  // ---- venue ----
  completeness?: number | null; // 0-1 (e.g. venue_twin readiness_score / 100)
  responsiveness?: number | null; // 0-1
  revenue_performance?: number | null; // 0-1 (normalized revenue strength)
  repeat_bookings?: number | null; // 0-1 (share / saturating count of repeats)
  compliance?: number | null; // 0-1 (e.g. compliance score / 100)

  // ---- vendor ----
  performance?: number | null; // 0-1 (e.g. vendor_readiness score / 100)
  on_time?: number | null; // 0-1
  quote_accuracy?: number | null; // 0-1
  response_speed?: number | null; // 0-1

  // ---- planner ----
  event_success_rate?: number | null; // 0-1
  organization?: number | null; // 0-1
  vendor_satisfaction?: number | null; // 0-1
  venue_satisfaction?: number | null; // 0-1
  client_satisfaction?: number | null; // 0-1

  // ---- sponsor ----
  activation_success?: number | null; // 0-1
  engagement?: number | null; // 0-1
  renewal?: number | null; // 0-1
  // (sponsor also reads `performance` above)

  // ---- client ----
  payment_history?: number | null; // 0-1
  communication?: number | null; // 0-1
  project_completion?: number | null; // 0-1
  reliability?: number | null; // 0-1

  // ---- shared ----
  reviews?: number | null; // 0-5 (average rating; normalized /5 internally)

  // ---- post-event feedback / satisfaction (F10) ----
  // Average of the role-matched event_feedback ratings for this entity, on the
  // same 0-5 scale as `reviews`. NULL / absent means "no feedback yet" and the
  // factor is dropped + the other factors renormalize so the entity is NOT
  // penalized for simply having no feedback (see computeDiviniScore).
  feedback?: number | null; // 0-5 (average post-event rating; normalized /5)
}

/** A single weighted factor descriptor. */
export interface DiviniWeight {
  key: keyof DiviniSignals;
  label: string;
  weight: number;
  /** How to normalize the raw signal. "unit" = clamp [0,1]; "five" = /5. */
  scale?: "unit" | "five";
}

/** A computed factor in the breakdown. */
export interface DiviniFactor {
  key: string;
  label: string;
  weight: number;
  earned: number;
}

/** The result of a Divini Score computation. */
export interface DiviniScoreResult {
  score: number;
  components: {
    entity_type: DiviniEntityType;
    factors: DiviniFactor[];
  };
}

// ---- Per-type weights (each set sums to 100) --------------------------------

/**
 * The exported weight tables, keyed by entity type. Each array is in display
 * order and its weights sum to 100. The repo and the surface both read these so
 * the breakdown labels and the badge are always consistent with the math.
 *
 * The "Post-event feedback" factor (F10) is a FIRST-CLASS factor: it carries
 * real weight so good feedback raises an entity's score and poor feedback lowers
 * it. It is "graceful-absence" (see GRACEFUL_ABSENCE_KEYS): when its signal is
 * null the factor is dropped entirely and the score is computed from the OTHER
 * factors alone, so an entity with no feedback yet scores EXACTLY as it did
 * before F10 was wired in (no regression for the empty-data case). When feedback
 * IS present, the whole set renormalizes to 100 so the feedback factor earns its
 * weighted share and moves the number up (good feedback) or down (poor feedback).
 *
 * To keep that invariant exact, the NON-feedback factors below are left at their
 * pre-F10 values (each non-feedback subset still sums to 100); the feedback
 * factor is ADDITIVE on top, and diviniScoreBreakdown renormalizes the active
 * set. The repo and the surface both read these tables.
 */
export const DIVINI_SCORE_WEIGHTS: Record<DiviniEntityType, DiviniWeight[]> = {
  venue: [
    { key: "completeness", label: "Profile completeness", weight: 20, scale: "unit" },
    { key: "responsiveness", label: "Responsiveness", weight: 15, scale: "unit" },
    { key: "revenue_performance", label: "Revenue performance", weight: 15, scale: "unit" },
    { key: "reviews", label: "Reviews", weight: 20, scale: "five" },
    { key: "repeat_bookings", label: "Repeat bookings", weight: 15, scale: "unit" },
    { key: "compliance", label: "Compliance", weight: 15, scale: "unit" },
    { key: "feedback", label: "Post-event feedback", weight: 18, scale: "five" },
  ],
  vendor: [
    { key: "performance", label: "Performance", weight: 22, scale: "unit" },
    { key: "reviews", label: "Reviews", weight: 18, scale: "five" },
    { key: "compliance", label: "Compliance", weight: 18, scale: "unit" },
    { key: "on_time", label: "On-time delivery", weight: 16, scale: "unit" },
    { key: "quote_accuracy", label: "Quote accuracy", weight: 14, scale: "unit" },
    { key: "response_speed", label: "Response speed", weight: 12, scale: "unit" },
    { key: "feedback", label: "Post-event feedback", weight: 18, scale: "five" },
  ],
  planner: [
    { key: "event_success_rate", label: "Event success rate", weight: 28, scale: "unit" },
    { key: "organization", label: "Organization", weight: 18, scale: "unit" },
    { key: "vendor_satisfaction", label: "Vendor satisfaction", weight: 18, scale: "unit" },
    { key: "venue_satisfaction", label: "Venue satisfaction", weight: 18, scale: "unit" },
    { key: "client_satisfaction", label: "Client satisfaction", weight: 18, scale: "unit" },
    { key: "feedback", label: "Post-event feedback", weight: 20, scale: "five" },
  ],
  sponsor: [
    { key: "activation_success", label: "Activation success", weight: 30, scale: "unit" },
    { key: "engagement", label: "Engagement", weight: 25, scale: "unit" },
    { key: "renewal", label: "Renewal", weight: 25, scale: "unit" },
    { key: "performance", label: "Performance", weight: 20, scale: "unit" },
    { key: "feedback", label: "Post-event feedback", weight: 20, scale: "five" },
  ],
  client: [
    { key: "payment_history", label: "Payment history", weight: 30, scale: "unit" },
    { key: "communication", label: "Communication", weight: 22, scale: "unit" },
    { key: "project_completion", label: "Project completion", weight: 26, scale: "unit" },
    { key: "reliability", label: "Reliability", weight: 22, scale: "unit" },
    { key: "feedback", label: "Post-event feedback", weight: 18, scale: "five" },
  ],
};

// ---- Normalizers ------------------------------------------------------------

/** Clamp a value to [0, 1]; null/NaN -> 0. */
function unit(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Normalize a 0-5 value to [0, 1]; null/NaN -> 0. */
function fiveUnit(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n / 5));
}

/** Normalize one factor's raw signal to [0, 1] per its scale. */
function normalize(value: number | null | undefined, scale: "unit" | "five" | undefined): number {
  return scale === "five" ? fiveUnit(value) : unit(value);
}

// ---- Score ------------------------------------------------------------------

/**
 * True when a signal value is genuinely present (a finite number). Absent
 * (null/undefined/NaN) means "no data": for graceful-absence factors that means
 * "drop me and renormalize", NOT "score me as zero".
 */
function isPresent(v: number | null | undefined): boolean {
  return v != null && Number.isFinite(Number(v));
}

/**
 * Factors that use "graceful absence": when the signal is absent the factor is
 * dropped from the breakdown and its weight is redistributed proportionally
 * across the remaining factors (so an entity with no such data scores exactly as
 * it did before the factor existed). Post-event feedback (F10) is the first such
 * factor: the empty-feedback case dominates production and must not regress.
 */
const GRACEFUL_ABSENCE_KEYS: ReadonlySet<keyof DiviniSignals> = new Set(["feedback"]);

/**
 * Per-factor breakdown for an entity type. Pure. Useful for an "improve your
 * Divini Score" nudge; computeDiviniScore sums the earned weights.
 *
 * Graceful-absence factors (e.g. post-event feedback) only participate when
 * their signal is actually present. When absent they are removed and the total
 * weight (100) is preserved by scaling the surviving factors up proportionally,
 * so the score for a no-data entity is unchanged from before the factor existed.
 */
export function diviniScoreBreakdown(
  entityType: DiviniEntityType,
  signals: DiviniSignals,
): DiviniFactor[] {
  const weights = DIVINI_SCORE_WEIGHTS[entityType] ?? [];

  // Decide which factors participate. A graceful-absence factor drops out when
  // its signal is absent; every other factor always participates (missing data
  // there scores 0, as before).
  const active = weights.filter(
    (w) => !GRACEFUL_ABSENCE_KEYS.has(w.key) || isPresent(signals[w.key]),
  );

  // Renormalize the active weights so they sum to the fixed 0-100 target. The
  // non-graceful (always-on) factors are authored to sum to 100 on their own, so
  // when no feedback exists the factor here is 1.0 and the score is byte-for-byte
  // identical to the pre-F10 computation. When feedback IS present the set sums
  // to >100 and scales down, giving feedback its proportional, bounded share.
  const NORM_TARGET = 100;
  const activeTotal = active.reduce((s, w) => s + w.weight, 0);
  const factor = activeTotal > 0 ? NORM_TARGET / activeTotal : 0;

  return active.map((w) => {
    const normalized = normalize(signals[w.key], w.scale);
    const effectiveWeight = Math.round(w.weight * factor * 100) / 100;
    return {
      key: String(w.key),
      label: w.label,
      weight: effectiveWeight,
      earned: Math.round(normalized * effectiveWeight * 100) / 100,
    };
  });
}

/**
 * Compute the Divini Score (0-100) and its component breakdown for an entity.
 * Pure: no DB calls. Sums the earned weight of each factor in the entity type's
 * weight set and clamps to [0, 100]. An unknown entity type yields score 0 with
 * an empty factor list (the repo guards against this, but the function is safe).
 */
export function computeDiviniScore(
  entityType: DiviniEntityType,
  signals: DiviniSignals,
): DiviniScoreResult {
  const factors = diviniScoreBreakdown(entityType, signals);
  const total = factors.reduce((sum, f) => sum + f.earned, 0);
  const score = Math.max(0, Math.min(100, Math.round(total)));
  return { score, components: { entity_type: entityType, factors } };
}
