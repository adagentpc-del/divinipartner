/**
 * Divini AI COO V2 - Marketplace Intelligence (pure analysis).
 *
 * computeMarketIntel() is a PURE function: given pre-aggregated ECOSYSTEM-WIDE
 * counts (no per-tenant rows, no org identifiers) it derives the marketplace
 * report - popular vendors/venues, growing categories, trending event types,
 * sponsor + inventory demand, and regional trends. It performs NO IO; the
 * aggregation is done in server/src/db/market-intel.ts which returns ONLY
 * aggregate counts (never individual tenant records), so nothing here can leak
 * per-tenant data. Degrades gracefully to empty arrays when the platform is
 * empty.
 *
 * "Popular" / "trending" are deterministic rankings by volume; "growing" uses a
 * recent-vs-prior period delta. All inputs are plain numbers and labels.
 */

/** A counted+ranked entity (vendor category, venue, event type, region...). */
export interface RankedCount {
  label: string;
  count: number;
}

/** An entity with a recent-vs-prior comparison for growth. */
export interface GrowthCount {
  label: string;
  recent: number;
  prior: number;
}

/** Aggregated, ecosystem-wide input. Contains counts only, no tenant rows. */
export interface MarketAggregates {
  /** Most-engaged vendor categories (event_vendors + quotes joined to vendors). */
  vendorCategories: RankedCount[];
  /** Most-booked venues, labelled by venue NAME only (aggregate, no org id). */
  venues: RankedCount[];
  /** Vendor/quote categories with recent vs prior activity (for growth). */
  categoryGrowth: GrowthCount[];
  /** Event types by recent vs prior volume (for trending). */
  eventTypeGrowth: GrowthCount[];
  /** Sponsorship demand: open opportunities + recent activity by category. */
  sponsorByCategory: RankedCount[];
  sponsorOpenTotal: number;
  /** Inventory/service demand: required services across events. */
  inventoryByService: RankedCount[];
  /** Regional activity: events + venues by region. */
  regions: RankedCount[];
  /** Regional growth (recent vs prior) for trend direction. */
  regionGrowth?: GrowthCount[];
}

export interface TrendItem {
  label: string;
  count: number;
  /** Growth as a 0..n multiplier delta percentage (recent vs prior). */
  growth_pct: number | null;
  direction: "up" | "down" | "flat" | "new";
}

export interface RegionalTrend {
  region: string;
  activity: number;
  growth_pct: number | null;
  direction: "up" | "down" | "flat" | "new";
}

export interface MarketIntel {
  generated_at: string;
  popularVendors: RankedCount[];
  popularVenues: RankedCount[];
  growingCategories: TrendItem[];
  trendingEventTypes: TrendItem[];
  sponsorDemand: { byCategory: RankedCount[]; open_total: number };
  inventoryDemand: RankedCount[];
  regionalTrends: RegionalTrend[];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function topN(rows: RankedCount[] | undefined, n: number): RankedCount[] {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ label: r.label || "uncategorized", count: num(r.count) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, n);
}

/** Recent-vs-prior delta -> growth percentage + a direction bucket. */
function growth(recent: number, prior: number): { growth_pct: number | null; direction: TrendItem["direction"] } {
  const r = num(recent);
  const p = num(prior);
  if (p <= 0) {
    if (r <= 0) return { growth_pct: null, direction: "flat" };
    return { growth_pct: null, direction: "new" };
  }
  const pct = Math.round(((r - p) / p) * 1000) / 10;
  let direction: TrendItem["direction"] = "flat";
  if (pct > 5) direction = "up";
  else if (pct < -5) direction = "down";
  return { growth_pct: pct, direction };
}

/**
 * Pure marketplace analysis over ecosystem-wide aggregates.
 * No IO, no randomness, deterministic ordering. Aggregate-only by construction.
 */
export function computeMarketIntel(agg: MarketAggregates): MarketIntel {
  const popularVendors = topN(agg?.vendorCategories, 10);
  const popularVenues = topN(agg?.venues, 10);

  const growingCategories: TrendItem[] = (Array.isArray(agg?.categoryGrowth) ? agg.categoryGrowth : [])
    .map((g) => {
      const recent = num(g.recent);
      const prior = num(g.prior);
      const gr = growth(recent, prior);
      return {
        label: g.label || "uncategorized",
        count: recent,
        growth_pct: gr.growth_pct,
        direction: gr.direction,
      };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => {
      // Growing first (up > new > flat > down), then by recent volume.
      const order: Record<TrendItem["direction"], number> = { up: 0, new: 1, flat: 2, down: 3 };
      return order[a.direction] - order[b.direction] || b.count - a.count || a.label.localeCompare(b.label);
    })
    .slice(0, 10);

  const trendingEventTypes: TrendItem[] = (Array.isArray(agg?.eventTypeGrowth) ? agg.eventTypeGrowth : [])
    .map((g) => {
      const recent = num(g.recent);
      const prior = num(g.prior);
      const gr = growth(recent, prior);
      return {
        label: g.label || "other",
        count: recent,
        growth_pct: gr.growth_pct,
        direction: gr.direction,
      };
    })
    .filter((t) => t.count > 0)
    .sort((a, b) => {
      const order: Record<TrendItem["direction"], number> = { up: 0, new: 1, flat: 2, down: 3 };
      return order[a.direction] - order[b.direction] || b.count - a.count || a.label.localeCompare(b.label);
    })
    .slice(0, 10);

  const regionalTrends: RegionalTrend[] = (() => {
    const byRegion = topN(agg?.regions, 50);
    const growthByRegion = new Map<string, GrowthCount>();
    for (const g of Array.isArray(agg?.regionGrowth) ? agg.regionGrowth : []) {
      growthByRegion.set(g.label || "unknown", g);
    }
    return byRegion
      .map((r) => {
        const g = growthByRegion.get(r.label);
        const gr = g ? growth(g.recent, g.prior) : { growth_pct: null, direction: "flat" as const };
        return {
          region: r.label,
          activity: r.count,
          growth_pct: gr.growth_pct,
          direction: gr.direction,
        };
      })
      .sort((a, b) => b.activity - a.activity || a.region.localeCompare(b.region))
      .slice(0, 10);
  })();

  return {
    generated_at: new Date().toISOString(),
    popularVendors,
    popularVenues,
    growingCategories,
    trendingEventTypes,
    sponsorDemand: {
      byCategory: topN(agg?.sponsorByCategory, 10),
      open_total: num(agg?.sponsorOpenTotal),
    },
    inventoryDemand: topN(agg?.inventoryByService, 10),
    regionalTrends,
  };
}
