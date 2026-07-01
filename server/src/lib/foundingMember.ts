/**
 * Intelligence Moat - F7 Founding Member Performance Center.
 *
 * Pure, deterministic performance scorer. Given a bag of raw metrics gathered
 * from the existing tables (see server/src/db/member-attendee.ts), it returns a
 * normalized performance summary: the headline numbers plus a 0..100 activity
 * score and a 0..100 composite performance score. No DB calls, no network, no
 * AI. Same inputs always produce the same output.
 *
 * The raw metrics are gathered elsewhere; this module only normalizes and
 * scores them so the math stays testable and the data layer stays thin.
 */

export type PerformanceMetrics = {
  /** Total revenue the org generated (sum of completed payments / invoices). */
  revenueGenerated: number;
  /** Referrals sent that converted (accepted platform invites). */
  referrals: number;
  /** Inbound leads attributed to the org (event inquiries). */
  leads: number;
  /** Quotes the org has issued. */
  quotes: number;
  /** Projects won (events reaching a won / completed state, or accepted quotes). */
  projectsWon: number;
  /** Commissions / platform fees attributable to the org's activity. */
  commissions: number;
  /** Estimated savings delivered (e.g. preferred pricing, fee discounts). */
  savings: number;
  /** Marketplace rank (1 = best); 0 / null when unranked. */
  marketplaceRank: number;
  /** Median response time in hours across quotes / inquiries (lower is better). */
  responseTimeHours: number;
  /** Average review rating 0..5. */
  reviewScore: number;
  /** Count of distinct active engagements (events touched in the window). */
  activeEngagements: number;
};

export type Performance = {
  revenueGenerated: number;
  referrals: number;
  leads: number;
  quotes: number;
  projectsWon: number;
  commissions: number;
  savings: number;
  marketplaceRank: number;
  /** 0..100 activity intensity (volume of platform activity). */
  activityScore: number;
  /** Response time in hours (passthrough, rounded). */
  responseTime: number;
  /** 0..100 composite performance score. */
  performanceScore: number;
  /** Win rate 0..1 (projectsWon / quotes). */
  winRate: number;
};

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));
const num = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/**
 * Normalize a raw count onto 0..100 with diminishing returns. `target` is the
 * value that maps to roughly 100. Linear up to the target, capped at 100.
 */
function scaleCount(value: number, target: number): number {
  if (target <= 0) return 0;
  return clamp((num(value) / target) * 100);
}

/**
 * Compute the normalized founding-member performance summary. Pure and
 * deterministic. The composite performanceScore is a weighted blend of:
 * revenue intensity, win rate, activity, review quality, and responsiveness.
 */
export function computePerformance(metrics: PerformanceMetrics): Performance {
  const revenueGenerated = num(metrics.revenueGenerated);
  const referrals = num(metrics.referrals);
  const leads = num(metrics.leads);
  const quotes = num(metrics.quotes);
  const projectsWon = num(metrics.projectsWon);
  const commissions = num(metrics.commissions);
  const savings = num(metrics.savings);
  const marketplaceRank = num(metrics.marketplaceRank);
  const responseTimeHours = num(metrics.responseTimeHours);
  const reviewScore = num(metrics.reviewScore);
  const activeEngagements = num(metrics.activeEngagements);

  // Win rate: projects won out of quotes issued (guard divide-by-zero).
  const winRate = quotes > 0 ? clamp(projectsWon / quotes, 0, 1) : 0;

  // Activity score: a blend of activity volumes, each normalized with its own
  // sensible "good" target so a busy org trends toward 100.
  const activityScore = clamp(
    Math.round(
      scaleCount(quotes, 25) * 0.3 +
        scaleCount(leads, 25) * 0.2 +
        scaleCount(referrals, 10) * 0.2 +
        scaleCount(activeEngagements, 20) * 0.3,
    ),
  );

  // Revenue intensity: $250k maps to roughly full marks.
  const revenueScore = scaleCount(revenueGenerated, 250_000);

  // Review quality on a 0..5 scale -> 0..100.
  const reviewQuality = clamp((reviewScore / 5) * 100);

  // Responsiveness: 0h -> 100, degrading to 0 by 72h.
  const responsiveness =
    responseTimeHours <= 0 ? 0 : clamp(100 - (responseTimeHours / 72) * 100);

  const performanceScore = clamp(
    Math.round(
      revenueScore * 0.3 +
        winRate * 100 * 0.25 +
        activityScore * 0.2 +
        reviewQuality * 0.15 +
        responsiveness * 0.1,
    ),
  );

  return {
    revenueGenerated,
    referrals,
    leads,
    quotes,
    projectsWon,
    commissions,
    savings,
    marketplaceRank,
    activityScore,
    responseTime: Math.round(responseTimeHours * 10) / 10,
    performanceScore,
    winRate: Math.round(winRate * 100) / 100,
  };
}

/** The default founding-member benefit flags. */
export type FoundingBenefits = {
  priorityPlacement: boolean;
  priorityMatching: boolean;
  enhancedAnalytics: boolean;
  lifetimePricing: boolean;
  foundingBadge: boolean;
  exclusiveOpportunities: boolean;
};

export const DEFAULT_FOUNDING_BENEFITS: FoundingBenefits = {
  priorityPlacement: true,
  priorityMatching: true,
  enhancedAnalytics: true,
  lifetimePricing: true,
  foundingBadge: true,
  exclusiveOpportunities: true,
};

/** Normalize an arbitrary stored benefits bag onto the known flag set. */
export function normalizeBenefits(raw: unknown): FoundingBenefits {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const flag = (k: keyof FoundingBenefits): boolean =>
    typeof b[k] === "boolean" ? (b[k] as boolean) : DEFAULT_FOUNDING_BENEFITS[k];
  return {
    priorityPlacement: flag("priorityPlacement"),
    priorityMatching: flag("priorityMatching"),
    enhancedAnalytics: flag("enhancedAnalytics"),
    lifetimePricing: flag("lifetimePricing"),
    foundingBadge: flag("foundingBadge"),
    exclusiveOpportunities: flag("exclusiveOpportunities"),
  };
}
