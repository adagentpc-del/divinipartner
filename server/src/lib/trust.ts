/**
 * Phase 7 - Trust score computation (blueprint 27.3). Pure, deterministic.
 *
 * A trust score (0-100) for a vendor / venue / client is a weighted blend of
 * the signals listed in blueprint 27.3:
 *   - average review rating
 *   - response speed
 *   - completion rate
 *   - document readiness
 *   - on-time rate
 *   - repeat-client rate
 *   - dispute rate (inverted: fewer disputes is better)
 *
 * Every input is normalized to a 0..1 sub-score, multiplied by its weight, and
 * summed. Missing inputs are simply omitted and the remaining weights are
 * re-normalized so a sparse profile is not unfairly punished. These functions
 * touch no database; the db layer (db/reviews.ts) gathers the inputs and calls
 * computeTrustScore.
 */

export type TrustTargetType = "vendor" | "venue" | "client";

/** Raw, already-aggregated inputs. Any field may be omitted (unknown). */
export type TrustInputs = {
  /** Average review rating on a 1..5 scale. */
  avgRating?: number | null;
  /** Number of reviews backing avgRating (drives a confidence factor). */
  reviewCount?: number | null;
  /** Median first-response time in hours (lower is better). */
  responseHours?: number | null;
  /** Fraction of engagements completed (0..1). */
  completionRate?: number | null;
  /** Fraction of required documents present and unexpired (0..1). */
  docReadiness?: number | null;
  /** Fraction of milestones / deliveries on time (0..1). */
  onTimeRate?: number | null;
  /** Fraction of engagements that were with a repeat counterparty (0..1). */
  repeatRate?: number | null;
  /** Fraction of engagements that ended in a dispute (0..1, lower is better). */
  disputeRate?: number | null;
};

export type TrustComponent = {
  key: string;
  label: string;
  weight: number;
  /** Normalized sub-score 0..1, or null when the input was unknown. */
  value: number | null;
};

export type TrustScore = {
  score: number; // 0..100, rounded
  band: "new" | "building" | "established" | "trusted" | "elite";
  label: string;
  components: TrustComponent[];
  /** How much of the total weight had data behind it (0..1). */
  coverage: number;
  /** A confidence multiplier driven by sample size (review count). */
  confidence: number;
};

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Map a 1..5 rating to 0..1. */
function ratingToUnit(rating: number): number {
  return clamp01((rating - 1) / 4);
}

/**
 * Map a response time in hours to 0..1 (1 = instant, decays toward 0).
 * <= 1h is effectively perfect; ~48h lands near the floor.
 */
function responseToUnit(hours: number): number {
  if (hours <= 1) return 1;
  if (hours >= 72) return 0.05;
  // smooth-ish decay across the 1..72h window
  return clamp01(1 - (hours - 1) / 71);
}

/** Sample-size confidence: ramps from 0.6 (no reviews) to 1.0 (>= 10 reviews). */
function confidenceFromCount(count: number): number {
  if (count <= 0) return 0.6;
  if (count >= 10) return 1;
  return 0.6 + (count / 10) * 0.4;
}

type WeightDef = { key: string; label: string; weight: number };

/** Per-target weighting of the trust signals (sums to 1.0 within a target). */
const WEIGHTS: Record<TrustTargetType, WeightDef[]> = {
  vendor: [
    { key: "rating", label: "Review rating", weight: 0.3 },
    { key: "completion", label: "Completion rate", weight: 0.18 },
    { key: "onTime", label: "On-time delivery", weight: 0.16 },
    { key: "docs", label: "Document readiness", weight: 0.12 },
    { key: "response", label: "Response speed", weight: 0.1 },
    { key: "repeat", label: "Repeat clients", weight: 0.08 },
    { key: "disputes", label: "Dispute-free", weight: 0.06 },
  ],
  venue: [
    { key: "rating", label: "Review rating", weight: 0.32 },
    { key: "completion", label: "Booking completion", weight: 0.18 },
    { key: "response", label: "Response speed", weight: 0.16 },
    { key: "docs", label: "Document readiness", weight: 0.12 },
    { key: "onTime", label: "On-time turnover", weight: 0.1 },
    { key: "repeat", label: "Repeat partners", weight: 0.07 },
    { key: "disputes", label: "Dispute-free", weight: 0.05 },
  ],
  client: [
    { key: "rating", label: "Partner reviews", weight: 0.3 },
    { key: "completion", label: "Follow-through", weight: 0.2 },
    { key: "onTime", label: "On-time payment", weight: 0.22 },
    { key: "response", label: "Responsiveness", weight: 0.13 },
    { key: "repeat", label: "Repeat bookings", weight: 0.1 },
    { key: "disputes", label: "Dispute-free", weight: 0.05 },
  ],
};

/** Resolve the normalized 0..1 value for one component, or null when unknown. */
function valueFor(key: string, inputs: TrustInputs): number | null {
  switch (key) {
    case "rating":
      return inputs.avgRating == null ? null : ratingToUnit(Number(inputs.avgRating));
    case "completion":
      return inputs.completionRate == null ? null : clamp01(Number(inputs.completionRate));
    case "onTime":
      return inputs.onTimeRate == null ? null : clamp01(Number(inputs.onTimeRate));
    case "docs":
      return inputs.docReadiness == null ? null : clamp01(Number(inputs.docReadiness));
    case "response":
      return inputs.responseHours == null ? null : responseToUnit(Number(inputs.responseHours));
    case "repeat":
      return inputs.repeatRate == null ? null : clamp01(Number(inputs.repeatRate));
    case "disputes":
      return inputs.disputeRate == null ? null : clamp01(1 - Number(inputs.disputeRate));
    default:
      return null;
  }
}

function bandFor(score: number): { band: TrustScore["band"]; label: string } {
  if (score >= 90) return { band: "elite", label: "Elite" };
  if (score >= 78) return { band: "trusted", label: "Trusted" };
  if (score >= 60) return { band: "established", label: "Established" };
  if (score >= 40) return { band: "building", label: "Building" };
  return { band: "new", label: "New" };
}

/**
 * Compute the trust score for a target type from already-aggregated inputs.
 * Deterministic: the same inputs always yield the same score.
 */
export function computeTrustScore(
  targetType: TrustTargetType,
  inputs: TrustInputs,
): TrustScore {
  const defs = WEIGHTS[targetType] ?? WEIGHTS.vendor;
  const components: TrustComponent[] = defs.map((d) => ({
    key: d.key,
    label: d.label,
    weight: d.weight,
    value: valueFor(d.key, inputs),
  }));

  const present = components.filter((c) => c.value != null);
  const presentWeight = present.reduce((s, c) => s + c.weight, 0);

  // Re-normalize across the signals that actually have data.
  let blended = 0;
  if (presentWeight > 0) {
    for (const c of present) {
      blended += (c.value as number) * (c.weight / presentWeight);
    }
  }

  const totalWeight = defs.reduce((s, d) => s + d.weight, 0) || 1;
  const coverage = clamp01(presentWeight / totalWeight);
  const confidence = confidenceFromCount(Number(inputs.reviewCount ?? 0));

  // Sparse profiles drift toward a neutral baseline (50) rather than swinging
  // wildly on one signal. confidence pulls the blended score toward the middle.
  const baseline = 0.5;
  const adjusted = baseline + (blended - baseline) * confidence;
  const score = Math.round(clamp01(adjusted) * 100);

  const { band, label } = bandFor(score);
  return { score, band, label, components, coverage, confidence };
}

/** Average a 1..5 rating list, returning null for an empty list. */
export function averageRating(ratings: Array<number | null | undefined>): number | null {
  const nums = ratings.map((r) => Number(r)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}
