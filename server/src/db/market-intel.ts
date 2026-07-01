/**
 * Divini AI COO V2 - Pricing + Marketplace Intelligence aggregation layer.
 *
 * Two distinct privacy postures, enforced HERE in SQL (the pure libs that
 * consume this output cannot leak what they never receive):
 *
 *   1. PRICING (org-scoped / private). gatherQuoteStats(orgId) aggregates the
 *      caller's OWN quotes + quote_drafts only. "Own" means quotes from a
 *      vendor in the caller's organization, plus quotes/drafts on events owned
 *      by the caller's organization. No cross-tenant numbers are returned. An
 *      admin may pass orgId = null to see ecosystem-wide pricing.
 *
 *   2. MARKETPLACE (ecosystem-wide, AGGREGATE-ONLY). gatherMarketAggregates()
 *      returns COUNTS grouped by category / venue-name / event-type / region.
 *      It NEVER returns per-tenant rows, organization ids, user ids, or money
 *      figures - only counts that describe the marketplace as a whole. This is
 *      what makes the marketplace report safe to show every tenant: there is no
 *      per-tenant data in the result to leak. Open to any signed-in user; an
 *      admin sees the same aggregate shape.
 *
 * Every query is defensive: status enums match db/schema.sql, money is summed
 * with coalesce, and missing tables/columns are avoided (we only touch columns
 * that exist in the committed schema). Empty platform -> empty arrays / zeros.
 */
import { q } from "../pool.js";
import type { QuoteStats, CategoryQuoteStat } from "../lib/pricingIntel.js";
import type {
  MarketAggregates,
  RankedCount,
  GrowthCount,
} from "../lib/marketplaceIntel.js";

const WON = "('accepted','converted')";
const LOST = "('declined','expired')";

/**
 * Org-scoped pricing aggregates: the caller's own quotes + quote_drafts,
 * grouped by service category. When orgId is null (admin), aggregates the whole
 * ecosystem. category is derived from the bid (preferred) or the vendor.
 */
export async function gatherQuoteStats(orgId: string | null): Promise<QuoteStats> {
  // Quotes scoped to the org: quotes whose vendor belongs to the org OR whose
  // event belongs to the org. category comes from the bid, falling back to the
  // vendor category. When orgId is null we drop the scope filter (admin).
  const scoped = orgId !== null;
  const byCategory = await q<{
    category: string;
    won: number;
    lost: number;
    pending: number;
    avg_total: number | null;
    min_total: number | null;
    max_total: number | null;
    avg_won_total: number | null;
    avg_lost_total: number | null;
  }>(
    `select
        coalesce(b.category, ve.category, 'uncategorized') as category,
        count(*) filter (where q.status in ${WON})::int as won,
        count(*) filter (where q.status in ${LOST})::int as lost,
        count(*) filter (where q.status not in ${WON} and q.status not in ${LOST})::int as pending,
        avg(q.total)::float8 as avg_total,
        min(q.total)::float8 as min_total,
        max(q.total)::float8 as max_total,
        avg(q.total) filter (where q.status in ${WON})::float8 as avg_won_total,
        avg(q.total) filter (where q.status in ${LOST})::float8 as avg_lost_total
       from quotes q
       left join bids b on b.id = q.bid_id
       left join vendors ve on ve.id = q.vendor_id
       left join events ev on ev.id = q.event_id
      where ($1::uuid is null or ve.organization_id = $1::uuid or ev.organization_id = $1::uuid)
      group by 1`,
    [orgId],
  );

  // Draft counts by category, same org scope (drafts link to a vendor + event).
  const draftRows = await q<{ category: string; drafts: number }>(
    `select
        coalesce(ve.category, 'uncategorized') as category,
        count(*)::int as drafts
       from quote_drafts d
       left join vendors ve on ve.id = d.vendor_id
       left join events ev on ev.id = d.event_id
      where ($1::uuid is null or ve.organization_id = $1::uuid or ev.organization_id = $1::uuid)
      group by 1`,
    [orgId],
  );
  const draftByCat = new Map(draftRows.map((r) => [r.category, Number(r.drafts) || 0]));

  const cats: CategoryQuoteStat[] = byCategory.map((r) => ({
    category: r.category || "uncategorized",
    won: Number(r.won) || 0,
    lost: Number(r.lost) || 0,
    pending: Number(r.pending) || 0,
    avg_total: Number(r.avg_total) || 0,
    min_total: r.min_total != null ? Number(r.min_total) : undefined,
    max_total: r.max_total != null ? Number(r.max_total) : undefined,
    avg_won_total: r.avg_won_total != null ? Number(r.avg_won_total) : undefined,
    avg_lost_total: r.avg_lost_total != null ? Number(r.avg_lost_total) : undefined,
    drafts: draftByCat.get(r.category) ?? 0,
  }));

  // Fold in categories that have drafts but no quotes yet.
  for (const [cat, drafts] of draftByCat) {
    if (!cats.some((c) => c.category === cat)) {
      cats.push({ category: cat, won: 0, lost: 0, pending: 0, avg_total: 0, drafts });
    }
  }

  const overall = cats.reduce(
    (acc, c) => {
      acc.won += c.won;
      acc.lost += c.lost;
      acc.pending = (acc.pending ?? 0) + (c.pending ?? 0);
      return acc;
    },
    { won: 0, lost: 0, pending: 0 } as { won: number; lost: number; pending: number },
  );

  void scoped; // scope is applied directly in SQL via the $1 guard
  return { byCategory: cats, overall };
}

// Recent vs prior window for growth/trending. Recent = last 90 days, prior =
// the 90 days before that. Deterministic, no fabricated history.
const RECENT = "now() - interval '90 days'";
const PRIOR_START = "now() - interval '180 days'";

/**
 * Ecosystem-wide AGGREGATE-ONLY marketplace counts. No org ids, user ids, or
 * money values are selected - only labelled counts. Safe to expose to any
 * signed-in user.
 */
export async function gatherMarketAggregates(): Promise<MarketAggregates> {
  // Popular vendor categories: how many event-vendor attachments + quotes
  // reference each vendor category, ecosystem-wide.
  const vendorCategories = await rankedCount(
    `select coalesce(ve.category, 'uncategorized') as label, count(*)::int as count
       from event_vendors evd
       join vendors ve on ve.id = evd.vendor_id
      group by 1`,
  );

  // Popular venues by NAME (aggregate label, not an org/owner identifier):
  // count of events booked into each named venue.
  const venues = await rankedCount(
    `select coalesce(v.name, 'unnamed venue') as label, count(ev.id)::int as count
       from venues v
       join events ev on ev.venue_id = v.id
      group by 1`,
  );

  // Category growth: recent vs prior quote volume by vendor category.
  const categoryGrowth = await growthCount(
    `select coalesce(ve.category, 'uncategorized') as label,
            count(*) filter (where q.created_at >= ${RECENT})::int as recent,
            count(*) filter (where q.created_at >= ${PRIOR_START} and q.created_at < ${RECENT})::int as prior
       from quotes q
       left join vendors ve on ve.id = q.vendor_id
      where q.created_at >= ${PRIOR_START}
      group by 1`,
  );

  // Event-type trending: recent vs prior event volume by event type.
  const eventTypeGrowth = await growthCount(
    `select coalesce(ev.type, 'other') as label,
            count(*) filter (where ev.created_at >= ${RECENT})::int as recent,
            count(*) filter (where ev.created_at >= ${PRIOR_START} and ev.created_at < ${RECENT})::int as prior
       from events ev
      where ev.created_at >= ${PRIOR_START}
      group by 1`,
  );

  // Sponsorship demand: open opportunities by category + open total.
  const sponsorByCategory = await rankedCount(
    `select coalesce(category, 'other') as label, count(*)::int as count
       from sponsorship_opportunities
      where status = 'open'
      group by 1`,
  );
  const sponsorOpenRow = await q<{ open_total: number }>(
    `select count(*)::int as open_total from sponsorship_opportunities where status = 'open'`,
  );
  const sponsorOpenTotal = Number(sponsorOpenRow[0]?.open_total) || 0;

  // Inventory / service demand: required_services across events (unnested).
  const inventoryByService = await rankedCount(
    `select lower(trim(s)) as label, count(*)::int as count
       from events ev, unnest(coalesce(ev.required_services, array[]::text[])) as s
      where trim(s) <> ''
      group by 1`,
  );

  // Regional activity: events joined to their venue's region (aggregate label).
  const regions = await rankedCount(
    `select coalesce(v.region, 'unspecified') as label, count(ev.id)::int as count
       from events ev
       join venues v on v.id = ev.venue_id
      group by 1`,
  );

  // Regional growth: recent vs prior event volume by venue region.
  const regionGrowth = await growthCount(
    `select coalesce(v.region, 'unspecified') as label,
            count(*) filter (where ev.created_at >= ${RECENT})::int as recent,
            count(*) filter (where ev.created_at >= ${PRIOR_START} and ev.created_at < ${RECENT})::int as prior
       from events ev
       join venues v on v.id = ev.venue_id
      where ev.created_at >= ${PRIOR_START}
      group by 1`,
  );

  return {
    vendorCategories,
    venues,
    categoryGrowth,
    eventTypeGrowth,
    sponsorByCategory,
    sponsorOpenTotal,
    inventoryByService,
    regions,
    regionGrowth,
  };
}

async function rankedCount(sql: string): Promise<RankedCount[]> {
  const rows = await q<{ label: string; count: number }>(sql);
  return rows.map((r) => ({ label: r.label || "uncategorized", count: Number(r.count) || 0 }));
}

async function growthCount(sql: string): Promise<GrowthCount[]> {
  const rows = await q<{ label: string; recent: number; prior: number }>(sql);
  return rows.map((r) => ({
    label: r.label || "uncategorized",
    recent: Number(r.recent) || 0,
    prior: Number(r.prior) || 0,
  }));
}
