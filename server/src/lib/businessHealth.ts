/**
 * Divini AI COO V2 - Business Health Score (AI-COO-V2-ROADMAP.md section 3).
 *
 * `computeBusinessHealth(signals)` is PURE: no DB work, no network, no AI. It
 * takes a bag of already-gathered, pre-normalized org-level signals and returns
 * { score 0-100, components, recommendations }. The business-health repo
 * (server/src/db/business-health.ts) supplies the signals (by aggregating the
 * existing tables for the actor's org) and persists the result in
 * business_health_scores on every write, so the stored score always reflects
 * current data and this function stays unit-testable in isolation.
 *
 * This is an ORG-LEVEL executive score, DISTINCT from the per-entity Divini
 * Score (lib/diviniScore.ts). Where the Divini Score rates a single venue /
 * vendor / planner / sponsor / client, the Business Health Score answers "how
 * healthy is this organization's business" across nine dimensions:
 *
 *   revenue        - paid revenue strength (saturating)
 *   activity        - recent event / quote / invoice throughput
 *   pipeline        - open quotes and live (non-terminal) events
 *   contracts       - signed / accepted vs total, fewer overdue/disputed
 *   referrals       - platform invites sent and accepted (network growth)
 *   bookings        - booking conversion (won events vs total)
 *   retention       - repeat clients share
 *   response_speed  - vendor_readiness response/quote speed across the org
 *   compliance      - vendor_compliance coverage across the org
 *
 * Every dimension is a normalized signal in [0, 1] multiplied by its weight, so
 * partial credit is possible and the breakdown explains the number. Weights sum
 * to 100. The function never throws on partial input: a missing signal is the
 * worst case (0) for its dimension.
 *
 * This file is ADDITIVE and does NOT import or modify the Divini Score libs.
 */

// ---- Dimensions -------------------------------------------------------------

/** The nine business-health dimension keys. */
export type BusinessHealthKey =
  | "revenue"
  | "activity"
  | "pipeline"
  | "contracts"
  | "referrals"
  | "bookings"
  | "retention"
  | "response_speed"
  | "compliance";

/**
 * The org-level signal bag. All fields are optional and pre-normalized to
 * [0, 1] by the repo (revenue/activity are saturating ratios). A missing field
 * is treated as 0 (worst case) for its dimension. `detail` strings are carried
 * separately on the components by the repo when it has a human figure to show.
 */
export interface BusinessHealthSignals {
  /** Paid revenue strength, saturating (e.g. paid total / saturation point). */
  revenue?: number | null;
  /** Recent throughput: events + quotes + invoices in the trailing window, saturating. */
  activity?: number | null;
  /** Pipeline strength: open quotes + live events, saturating. */
  pipeline?: number | null;
  /** Contract health: accepted/signed share net of overdue/disputed penalty. */
  contracts?: number | null;
  /** Referral / network growth: invites accepted (and sent), saturating. */
  referrals?: number | null;
  /** Booking conversion: won events / total events. */
  bookings?: number | null;
  /** Retention: repeat-client share. */
  retention?: number | null;
  /** Response speed: vendor_readiness response/quote speed average across the org. */
  response_speed?: number | null;
  /** Compliance: vendor_compliance score / coverage across the org. */
  compliance?: number | null;
}

/** A single weighted dimension descriptor. */
export interface BusinessHealthWeight {
  key: BusinessHealthKey;
  label: string;
  weight: number;
}

/** A computed dimension in the breakdown. */
export interface BusinessHealthComponent {
  key: BusinessHealthKey;
  label: string;
  weight: number;
  /** The earned weight (normalized value * weight), rounded to 2dp. */
  earned: number;
  /** The normalized value in [0, 1] that produced `earned`, rounded to 2dp. */
  value: number;
}

/** A single prioritized recommendation. */
export interface BusinessHealthRecommendation {
  key: BusinessHealthKey;
  /** 1 = highest. Lower-scoring, higher-weight dimensions surface first. */
  priority: number;
  title: string;
  detail: string;
}

/** The result of a Business Health computation. */
export interface BusinessHealthResult {
  score: number;
  components: BusinessHealthComponent[];
  recommendations: BusinessHealthRecommendation[];
}

// ---- Weights (sum to 100) ---------------------------------------------------

/**
 * The exported dimension weights, in display order, summing to 100. The repo
 * and the surface both read this so the breakdown labels and the score stay
 * consistent with the math.
 */
export const BUSINESS_HEALTH_WEIGHTS: BusinessHealthWeight[] = [
  { key: "revenue", label: "Revenue", weight: 18 },
  { key: "activity", label: "Activity", weight: 12 },
  { key: "pipeline", label: "Pipeline", weight: 14 },
  { key: "contracts", label: "Contracts", weight: 12 },
  { key: "referrals", label: "Referrals", weight: 8 },
  { key: "bookings", label: "Bookings", weight: 14 },
  { key: "retention", label: "Retention", weight: 10 },
  { key: "response_speed", label: "Response speed", weight: 6 },
  { key: "compliance", label: "Compliance", weight: 6 },
];

// ---- Recommendation copy ----------------------------------------------------

/**
 * Per-dimension recommendation text, surfaced when the dimension is scoring
 * below full credit. Deterministic and data-free (the repo can append a figure
 * to the detail when it has one). Title is the action; detail is the why.
 */
const RECOMMENDATION_COPY: Record<BusinessHealthKey, { title: string; detail: string }> = {
  revenue: {
    title: "Grow collected revenue",
    detail:
      "Paid revenue is below target. Convert accepted quotes to invoices and collect outstanding balances.",
  },
  activity: {
    title: "Increase platform activity",
    detail:
      "Throughput is light. Create events, request quotes, and issue invoices to keep the pipeline moving.",
  },
  pipeline: {
    title: "Build the pipeline",
    detail:
      "Few open quotes or live events. Post bids, request quotes, and keep events progressing through the funnel.",
  },
  contracts: {
    title: "Tighten contract health",
    detail:
      "Too many quotes are unaccepted, or invoices are overdue or disputed. Chase signatures and clear bad invoices.",
  },
  referrals: {
    title: "Grow the network",
    detail:
      "Few invites sent or accepted. Invite vendors, venues, planners, and clients to compound your network.",
  },
  bookings: {
    title: "Improve booking conversion",
    detail:
      "A low share of events convert to won bookings. Follow up faster and sharpen quotes to win more events.",
  },
  retention: {
    title: "Drive repeat business",
    detail:
      "Few clients book more than once. Invest in post-event follow-up and loyalty to lift repeat bookings.",
  },
  response_speed: {
    title: "Respond faster",
    detail:
      "Response and quote speed are slow. Faster replies and quotes raise win rates and client satisfaction.",
  },
  compliance: {
    title: "Close compliance gaps",
    detail:
      "Compliance coverage is incomplete. Collect insurance, COIs, W9s, and licenses so events are not blocked.",
  },
};

// ---- Normalizer -------------------------------------------------------------

/** Clamp a value to [0, 1]; null/NaN -> 0. */
function unit(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Round to 2 decimal places (deterministic). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---- Score ------------------------------------------------------------------

/**
 * Per-dimension breakdown for the org. Pure. computeBusinessHealth sums the
 * earned weights and derives the prioritized recommendations.
 */
export function businessHealthBreakdown(
  signals: BusinessHealthSignals,
): BusinessHealthComponent[] {
  return BUSINESS_HEALTH_WEIGHTS.map((w) => {
    const value = unit(signals[w.key]);
    return {
      key: w.key,
      label: w.label,
      weight: w.weight,
      value: round2(value),
      earned: round2(value * w.weight),
    };
  });
}

/** A dimension scoring below this fraction of its weight earns a recommendation. */
const RECOMMENDATION_THRESHOLD = 0.85;

/**
 * Compute the org-level Business Health Score (0-100), its component breakdown,
 * and a prioritized recommendation list. Pure: no DB calls. Sums the earned
 * weight of each dimension and clamps to [0, 100]. Recommendations surface for
 * any dimension earning less than RECOMMENDATION_THRESHOLD of its weight,
 * ordered by the most weight left on the table (biggest opportunity first),
 * then by raw weight, with a stable 1-based priority.
 */
export function computeBusinessHealth(
  signals: BusinessHealthSignals,
): BusinessHealthResult {
  const components = businessHealthBreakdown(signals);
  const total = components.reduce((sum, c) => sum + c.earned, 0);
  const score = Math.max(0, Math.min(100, Math.round(total)));

  const ranked = components
    .filter((c) => c.value < RECOMMENDATION_THRESHOLD)
    .map((c) => ({ component: c, gap: round2((1 - c.value) * c.weight) }))
    .sort((a, b) => {
      if (b.gap !== a.gap) return b.gap - a.gap;
      return b.component.weight - a.component.weight;
    });

  const recommendations: BusinessHealthRecommendation[] = ranked.map((r, i) => {
    const copy = RECOMMENDATION_COPY[r.component.key];
    return {
      key: r.component.key,
      priority: i + 1,
      title: copy.title,
      detail: copy.detail,
    };
  });

  return { score, components, recommendations };
}
