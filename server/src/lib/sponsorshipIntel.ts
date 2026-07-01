/**
 * Friction Elimination - Sponsorship Intelligence engine (Upgrade 16).
 *
 * FRICTION-ELIMINATION-ADDENDUM.md U16: "impressions, audience demographics,
 * historical performance, revenue, asset availability; auto-recommend +
 * brand<->venue matching". This module is the deterministic scoring + ranking
 * core. It is PURE: it does no DB work. The repo
 * (server/src/db/sponsorship-intel.ts) loads sponsorship_opportunities joined to
 * sponsorship_metrics, hands the rows here, and the route serializes the result.
 *
 * Deterministic-first per the addendum cost rules: no AI, no randomness. The
 * same inputs always yield the same ranking, so it is unit-testable in isolation
 * and cheap to run on every request.
 *
 * `recommendSponsorships` ranks a venue's packaged opportunities for a concrete
 * event brief (venue type, event type, budget, guest count, optional audience),
 * scoring each on budget fit, audience/guest fit, reach, proven performance,
 * availability, and category match. `matchBrandsToVenues` is the inverse view:
 * given a brand brief it scores opportunities by how well the brand's target
 * audience + budget line up with each package. Both return a rollup of estimated
 * impressions and revenue across the recommended set.
 */

// ---- Inputs + row shapes ----------------------------------------------------

/** A sponsorship opportunity joined to its (optional) intelligence metrics. */
export interface SponsorshipCandidate {
  id: string;
  venue_id: string | null;
  organization_id: string | null;
  name: string;
  category: string | null;
  audience_size: number | null;
  impression_estimate: number | null;
  pricing: unknown;
  deliverables: unknown;
  availability: unknown;
  status: string | null;
  /** From sponsorship_metrics (may be absent when no metrics row exists). */
  impressions?: number | null;
  demographics?: unknown;
  historical_performance?: unknown;
  revenue?: number | null;
  asset_availability?: unknown;
}

/** Event brief for recommendSponsorships (U1 intake shape, sponsorship slice). */
export interface SponsorshipBrief {
  venueType?: string | null;
  eventType?: string | null;
  budget?: number | null;
  guestCount?: number | null;
  /** Optional target audience descriptor (free text, e.g. "luxury", "tech"). */
  audience?: string | null;
}

/** Brand brief for matchBrandsToVenues. */
export interface BrandBrief {
  /** The brand's target audience descriptor (free text). */
  audience?: string | null;
  /** The brand's sponsorship budget. */
  budget?: number | null;
  /** Preferred sponsorship category (title, digital, signage, ...). */
  category?: string | null;
  /** Minimum reach (impressions) the brand wants. */
  minImpressions?: number | null;
}

/** A scored recommendation with a transparent factor breakdown. */
export interface SponsorshipRecommendation {
  id: string;
  venue_id: string | null;
  name: string;
  category: string | null;
  /** 0-100 deterministic fit score. */
  score: number;
  /** Why this scored what it did (label + 0-1 contribution). */
  reasons: { label: string; value: number }[];
  estimated_impressions: number;
  estimated_revenue: number;
  price: number | null;
}

/** Rollup across a recommended set. */
export interface SponsorshipRollup {
  count: number;
  estimated_impressions: number;
  estimated_revenue: number;
}

export interface SponsorshipRecommendResult {
  recommendations: SponsorshipRecommendation[];
  rollup: SponsorshipRollup;
}

// ---- Helpers (pure) ---------------------------------------------------------

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pull a price amount from a pricing jsonb ({ amount } or { price }). */
export function priceOf(pricing: unknown): number | null {
  if (!pricing || typeof pricing !== "object") return null;
  const rec = pricing as Record<string, unknown>;
  return numOrNull(rec.amount) ?? numOrNull(rec.price);
}

/** Best-available impressions: measured metrics first, then the package estimate. */
export function impressionsOf(c: SponsorshipCandidate): number {
  return numOrNull(c.impressions) ?? numOrNull(c.impression_estimate) ?? 0;
}

/** Best-available revenue: metrics revenue first, then the package price. */
export function revenueOf(c: SponsorshipCandidate): number {
  return numOrNull(c.revenue) ?? priceOf(c.pricing) ?? 0;
}

/**
 * Historical performance score 0-1. Reads a few well-known numeric keys from the
 * historical_performance jsonb (sell_through, renewal_rate, satisfaction 0-5,
 * runs). Missing -> a neutral baseline so unmeasured packages are not punished
 * to zero. Pure and deterministic.
 */
export function historicalScore(hp: unknown): number {
  if (!hp || typeof hp !== "object") return 0.5;
  const rec = hp as Record<string, unknown>;
  const parts: number[] = [];
  const sellThrough = numOrNull(rec.sell_through);
  if (sellThrough != null) parts.push(clamp01(sellThrough > 1 ? sellThrough / 100 : sellThrough));
  const renewal = numOrNull(rec.renewal_rate);
  if (renewal != null) parts.push(clamp01(renewal > 1 ? renewal / 100 : renewal));
  const satisfaction = numOrNull(rec.satisfaction);
  if (satisfaction != null) parts.push(clamp01(satisfaction / 5));
  if (parts.length === 0) return 0.5;
  return parts.reduce((s, p) => s + p, 0) / parts.length;
}

/**
 * Availability score 0-1. asset_availability jsonb may carry { open, total } or
 * an `available` boolean; the package availability jsonb may carry a `sold_out`
 * flag. Open packages score high, sold-out score low, unknown is neutral-high.
 */
export function availabilityScore(c: SponsorshipCandidate): number {
  const aa = c.asset_availability;
  if (aa && typeof aa === "object") {
    const rec = aa as Record<string, unknown>;
    const open = numOrNull(rec.open);
    const total = numOrNull(rec.total);
    if (open != null && total != null && total > 0) return clamp01(open / total);
    if (typeof rec.available === "boolean") return rec.available ? 1 : 0;
  }
  const av = c.availability;
  if (av && typeof av === "object") {
    const rec = av as Record<string, unknown>;
    if (rec.sold_out === true) return 0;
  }
  if ((c.status ?? "open") !== "open") return 0.2;
  return 0.8;
}

/** Budget fit 0-1: 1 when price <= budget, tapering as price exceeds budget. */
function budgetFit(price: number | null, budget: number | null | undefined): number {
  if (budget == null || !Number.isFinite(budget) || budget <= 0) return 0.5; // unknown budget -> neutral
  if (price == null) return 0.5; // unknown price -> neutral
  if (price <= budget) return 1;
  // Over budget: linear taper, 0 once price is double the budget.
  return clamp01(1 - (price - budget) / budget);
}

/** Audience fit 0-1 from a guest count vs the package audience size. */
function guestFit(audienceSize: number | null, guestCount: number | null | undefined): number {
  if (guestCount == null || !Number.isFinite(guestCount) || guestCount <= 0) return 0.5;
  if (audienceSize == null || audienceSize <= 0) return 0.4;
  // Reward packages whose audience comfortably covers the guest count.
  const ratio = audienceSize / guestCount;
  if (ratio >= 1) return clamp01(0.7 + Math.min(0.3, (ratio - 1) / 10));
  return clamp01(ratio * 0.7);
}

/** Lowercase text match helper: 1 when needle appears in haystack, else 0. */
function textMatch(haystack: unknown, needle: string | null | undefined): number {
  if (!needle) return 0.5; // no preference -> neutral
  const n = String(needle).trim().toLowerCase();
  if (!n) return 0.5;
  const h = JSON.stringify(haystack ?? "").toLowerCase();
  return h.includes(n) ? 1 : 0;
}

/** Normalize an impressions count to 0-1 against a soft 1M reference ceiling. */
function reachScore(impressions: number): number {
  return clamp01(impressions / 1_000_000);
}

// ---- recommendSponsorships --------------------------------------------------

/** Weighted factors for the event-side recommendation (sum to 1). */
const RECOMMEND_WEIGHTS = {
  budget: 0.25,
  guests: 0.2,
  reach: 0.2,
  historical: 0.15,
  availability: 0.1,
  category: 0.1,
};

/**
 * Rank a venue's packaged sponsorship opportunities for a concrete event brief.
 * Pure + deterministic. Returns recommendations sorted by score descending plus
 * a rollup of estimated impressions and revenue across the recommended set.
 *
 * `candidates` are pre-loaded by the repo (a venue's opportunities joined to
 * their metrics). Closed / draft packages are filtered out (only `open`, or no
 * status, are eligible).
 */
export function recommendSponsorships(
  brief: SponsorshipBrief,
  candidates: SponsorshipCandidate[],
  limit = 20,
): SponsorshipRecommendResult {
  const eligible = candidates.filter((c) => (c.status ?? "open") === "open");

  const scored = eligible.map((c) => {
    const price = priceOf(c.pricing);
    const reasons: { label: string; value: number }[] = [
      { label: "Budget fit", value: budgetFit(price, brief.budget) },
      { label: "Guest / audience fit", value: guestFit(c.audience_size, brief.guestCount) },
      { label: "Reach", value: reachScore(impressionsOf(c)) },
      { label: "Proven performance", value: historicalScore(c.historical_performance) },
      { label: "Availability", value: availabilityScore(c) },
      {
        label: "Audience match",
        value: textMatch([c.category, c.name, c.demographics], brief.audience),
      },
    ];
    const raw =
      reasons[0].value * RECOMMEND_WEIGHTS.budget +
      reasons[1].value * RECOMMEND_WEIGHTS.guests +
      reasons[2].value * RECOMMEND_WEIGHTS.reach +
      reasons[3].value * RECOMMEND_WEIGHTS.historical +
      reasons[4].value * RECOMMEND_WEIGHTS.availability +
      reasons[5].value * RECOMMEND_WEIGHTS.category;
    const rec: SponsorshipRecommendation = {
      id: c.id,
      venue_id: c.venue_id,
      name: c.name,
      category: c.category,
      score: Math.round(clamp01(raw) * 100),
      reasons: reasons.map((r) => ({ label: r.label, value: Math.round(r.value * 100) / 100 })),
      estimated_impressions: impressionsOf(c),
      estimated_revenue: revenueOf(c),
      price,
    };
    return rec;
  });

  // Deterministic sort: score desc, then estimated impressions desc, then id asc.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.estimated_impressions - a.estimated_impressions ||
      a.id.localeCompare(b.id),
  );

  const top = scored.slice(0, Math.max(1, Math.min(100, limit)));
  return { recommendations: top, rollup: rollup(top) };
}

// ---- matchBrandsToVenues ----------------------------------------------------

/** Weighted factors for the brand-side match (sum to 1). */
const MATCH_WEIGHTS = {
  audience: 0.3,
  budget: 0.25,
  reach: 0.25,
  category: 0.1,
  historical: 0.1,
};

/**
 * Match a brand brief to sponsorship opportunities across one or many venues.
 * Pure + deterministic. Scores each open opportunity by how well the brand's
 * target audience, budget, desired reach, and category line up. Returns the same
 * recommendation + rollup shape as recommendSponsorships so the UI can render
 * both views identically.
 */
export function matchBrandsToVenues(
  brand: BrandBrief,
  candidates: SponsorshipCandidate[],
  limit = 20,
): SponsorshipRecommendResult {
  const eligible = candidates.filter((c) => (c.status ?? "open") === "open");

  const scored = eligible.map((c) => {
    const price = priceOf(c.pricing);
    const impressions = impressionsOf(c);
    const meetsReach =
      brand.minImpressions == null || !Number.isFinite(brand.minImpressions)
        ? reachScore(impressions)
        : impressions >= (brand.minImpressions as number)
          ? 1
          : clamp01(impressions / (brand.minImpressions as number));
    const reasons: { label: string; value: number }[] = [
      {
        label: "Audience match",
        value: textMatch([c.category, c.name, c.demographics], brand.audience),
      },
      { label: "Budget fit", value: budgetFit(price, brand.budget) },
      { label: "Reach", value: meetsReach },
      {
        label: "Category match",
        value: brand.category ? (c.category === brand.category ? 1 : 0) : 0.5,
      },
      { label: "Proven performance", value: historicalScore(c.historical_performance) },
    ];
    const raw =
      reasons[0].value * MATCH_WEIGHTS.audience +
      reasons[1].value * MATCH_WEIGHTS.budget +
      reasons[2].value * MATCH_WEIGHTS.reach +
      reasons[3].value * MATCH_WEIGHTS.category +
      reasons[4].value * MATCH_WEIGHTS.historical;
    const rec: SponsorshipRecommendation = {
      id: c.id,
      venue_id: c.venue_id,
      name: c.name,
      category: c.category,
      score: Math.round(clamp01(raw) * 100),
      reasons: reasons.map((r) => ({ label: r.label, value: Math.round(r.value * 100) / 100 })),
      estimated_impressions: impressions,
      estimated_revenue: revenueOf(c),
      price,
    };
    return rec;
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      b.estimated_impressions - a.estimated_impressions ||
      a.id.localeCompare(b.id),
  );

  const top = scored.slice(0, Math.max(1, Math.min(100, limit)));
  return { recommendations: top, rollup: rollup(top) };
}

// ---- Rollups ----------------------------------------------------------------

/** Sum estimated impressions and revenue across a recommendation set. Pure. */
export function rollup(recs: SponsorshipRecommendation[]): SponsorshipRollup {
  return {
    count: recs.length,
    estimated_impressions: recs.reduce((s, r) => s + (r.estimated_impressions || 0), 0),
    estimated_revenue: recs.reduce((s, r) => s + (r.estimated_revenue || 0), 0),
  };
}
