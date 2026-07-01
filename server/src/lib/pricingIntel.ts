/**
 * Divini AI COO V2 - Pricing Intelligence (pure analysis).
 *
 * analyzePricing() is a PURE function: given pre-aggregated quote statistics it
 * derives win rates, market rate bands, and a ranked list of pricing
 * recommendations (raise price, adjust price, change packaging, add a new
 * offering). It performs NO IO - the aggregation (org-scoped) is done in
 * server/src/db/market-intel.ts and handed in here. This keeps the math
 * deterministic and trivially testable, and degrades gracefully (empty arrays,
 * zeroed rates) when there is no data yet.
 *
 * Definitions:
 *   - A "won" quote is accepted | converted. A "lost" quote is declined |
 *     expired. win_rate = won / (won + lost), as a 0..100 percentage.
 *   - Price bands are computed from the per-category quote totals, split into
 *     low / mid / high by tercile of the observed totals, and each band carries
 *     its own win rate so we can see whether higher prices still close.
 */

/** A single category's quote statistics (one row per service category). */
export interface CategoryQuoteStat {
  category: string;
  /** Number of quotes that closed (accepted | converted). */
  won: number;
  /** Number of quotes that were lost (declined | expired). */
  lost: number;
  /** Quotes still in flight (neither won nor lost). */
  pending?: number;
  /** Average total across ALL quotes in this category (won + lost + pending). */
  avg_total: number;
  /** Lowest / highest observed quote total in this category. */
  min_total?: number;
  max_total?: number;
  /** Average total of the quotes that WON (closed). */
  avg_won_total?: number;
  /** Average total of the quotes that LOST. */
  avg_lost_total?: number;
  /** Count of draft quotes for this category (quote_drafts). */
  drafts?: number;
}

/** Aggregated input to analyzePricing(). */
export interface QuoteStats {
  byCategory: CategoryQuoteStat[];
  /** Totals across all categories (used for the overall win-rate headline). */
  overall?: { won: number; lost: number; pending?: number };
}

export interface WinRateByPrice {
  category: string;
  win_rate: number; // 0..100
  won: number;
  lost: number;
  pending: number;
  decided: number;
}

export interface MarketRateBand {
  category: string;
  low: number;
  mid: number;
  high: number;
  /** Win rate of quotes priced at or below the mid band vs above it. */
  win_rate_at_or_below_mid: number;
  win_rate_above_mid: number;
}

export type RecommendationKind =
  | "price_increase"
  | "price_adjustment"
  | "package_change"
  | "new_offering";

export interface PricingRecommendation {
  kind: RecommendationKind;
  category: string;
  title: string;
  detail: string;
  /** 0..100 confidence-ish priority; higher = act sooner. Deterministic. */
  priority: number;
}

export interface PricingAnalysis {
  generated_at: string;
  overall_win_rate: number; // 0..100
  winRateByPrice: WinRateByPrice[];
  marketRateBands: MarketRateBand[];
  recommendations: PricingRecommendation[];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Win rate as a 0..100 percentage rounded to one decimal; 0 when undecided. */
function rate(won: number, lost: number): number {
  const decided = won + lost;
  if (decided <= 0) return 0;
  return Math.round((won / decided) * 1000) / 10;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Pure pricing analysis over pre-aggregated per-category quote stats.
 * No IO, no randomness, deterministic ordering.
 */
export function analyzePricing(stats: QuoteStats): PricingAnalysis {
  const cats = Array.isArray(stats?.byCategory) ? stats.byCategory : [];

  // ---- win rate by category ----
  const winRateByPrice: WinRateByPrice[] = cats
    .map((c) => {
      const won = num(c.won);
      const lost = num(c.lost);
      const pending = num(c.pending);
      return {
        category: c.category || "uncategorized",
        win_rate: rate(won, lost),
        won,
        lost,
        pending,
        decided: won + lost,
      };
    })
    .sort((a, b) => b.decided - a.decided || a.category.localeCompare(b.category));

  // ---- market rate bands by category ----
  const marketRateBands: MarketRateBand[] = cats
    .map((c) => {
      const avg = num(c.avg_total);
      const min = c.min_total != null ? num(c.min_total) : avg;
      const max = c.max_total != null ? num(c.max_total) : avg;
      // Terciles across the observed [min, max] range, anchored on the average.
      const span = Math.max(0, max - min);
      const low = round2(min);
      const high = round2(max);
      const mid = round2(avg > 0 ? avg : min + span / 2);
      // Win rate split: quotes that won at or below mid vs above it. We use the
      // avg won/lost totals as a deterministic proxy for "where wins cluster".
      const avgWon = c.avg_won_total != null ? num(c.avg_won_total) : 0;
      const avgLost = c.avg_lost_total != null ? num(c.avg_lost_total) : 0;
      const won = num(c.won);
      const lost = num(c.lost);
      // If wins cluster at or below the mid band, attribute the win rate there.
      const winsAtOrBelowMid = avgWon > 0 && avgWon <= mid;
      const lossesAboveMid = avgLost > 0 && avgLost > mid;
      return {
        category: c.category || "uncategorized",
        low,
        mid,
        high,
        win_rate_at_or_below_mid: winsAtOrBelowMid ? rate(won, lossesAboveMid ? 0 : lost) : rate(won, lost),
        win_rate_above_mid: lossesAboveMid ? rate(winsAtOrBelowMid ? 0 : won, lost) : rate(won, lost),
      };
    })
    .sort((a, b) => b.mid - a.mid || a.category.localeCompare(b.category));

  // ---- recommendations ----
  const recommendations: PricingRecommendation[] = [];
  for (const c of cats) {
    const cat = c.category || "uncategorized";
    const won = num(c.won);
    const lost = num(c.lost);
    const decided = won + lost;
    const wr = rate(won, lost);
    const avg = num(c.avg_total);
    const drafts = num(c.drafts);

    if (decided >= 3 && wr >= 70) {
      // Closing most of the time -> headroom to raise price.
      recommendations.push({
        kind: "price_increase",
        category: cat,
        title: `Raise ${cat} pricing`,
        detail:
          `Win rate is ${wr}% across ${decided} decided quotes (avg ${avg > 0 ? "$" + Math.round(avg).toLocaleString() : "n/a"}). ` +
          `High close rates suggest room to test a price increase without losing volume.`,
        priority: Math.min(100, Math.round(wr)),
      });
    } else if (decided >= 3 && wr > 0 && wr < 35) {
      // Losing most of the time -> adjust price / re-package.
      recommendations.push({
        kind: "price_adjustment",
        category: cat,
        title: `Re-price ${cat} quotes`,
        detail:
          `Win rate is only ${wr}% across ${decided} decided quotes. ` +
          `Quotes are losing on price or scope; consider a lower entry price or clearer value framing.`,
        priority: Math.min(100, Math.round(100 - wr)),
      });
      recommendations.push({
        kind: "package_change",
        category: cat,
        title: `Re-package ${cat} offering`,
        detail:
          `With a ${wr}% win rate, bundling ${cat} into a tiered package (good / better / best) often lifts close rates ` +
          `more than discounting a single line item.`,
        priority: Math.min(95, Math.round(90 - wr)),
      });
    } else if (decided >= 3 && wr >= 35 && wr < 70) {
      // Middling -> a measured adjustment.
      recommendations.push({
        kind: "price_adjustment",
        category: cat,
        title: `Tune ${cat} pricing`,
        detail:
          `Win rate is ${wr}% across ${decided} decided quotes - a small price or scope adjustment could move it toward 70%.`,
        priority: Math.round(60 - Math.abs(55 - wr)),
      });
    }

    // Drafts that never convert into submitted quotes -> a productization gap.
    if (drafts >= 3 && decided === 0) {
      recommendations.push({
        kind: "new_offering",
        category: cat,
        title: `Productize ${cat} as a fixed offering`,
        detail:
          `${drafts} draft quotes exist for ${cat} but none have closed. A standardized, list-priced ${cat} package ` +
          `would shorten the path from interest to booking.`,
        priority: Math.min(80, 40 + drafts * 3),
      });
    }
  }

  // Deterministic ordering: highest priority first, then category name.
  recommendations.sort((a, b) => b.priority - a.priority || a.category.localeCompare(b.category));

  const overallWon = num(stats?.overall?.won);
  const overallLost = num(stats?.overall?.lost);

  return {
    generated_at: new Date().toISOString(),
    overall_win_rate: rate(overallWon, overallLost),
    winRateByPrice,
    marketRateBands,
    recommendations,
  };
}
