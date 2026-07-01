/**
 * Phase 8 - Marketplace search + SEO profile data (blueprint 38 + 40).
 *
 * Searches PUBLISHED public profiles only (the `profiles` table joined to its
 * organization + venue / vendor record). PUBLIC data only: no private pricing,
 * no contact internals, no documents. The SEO profile reader returns the same
 * approved, clearly-labeled fields a search engine / anonymous visitor may see.
 *
 * Search itself is public (no auth); the authed MarketplaceSearch page simply
 * gets a richer surface. Filters follow blueprint 38.1 (vendor) and 38.2
 * (venue); sorting follows 38.3.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError } from "../db.js";
import {
  marketplaceRankingScore,
  type PreferredTier,
} from "../lib/vendorReadiness.js";

export const SORTS = ["relevance", "rating", "newest", "name"] as const;
export type Sort = (typeof SORTS)[number];

export type MarketplaceResult = {
  slug: string | null;
  kind: string | null;
  organization_id: string | null;
  name: string | null;
  about: string | null;
  region: string | null;
  city: string | null;
  category: string | null;
  capacity: number | null;
  review_score: number | null;
  preferred: boolean;
  premier: boolean;
  hero: unknown;
  theme: unknown;
  // Phase 4 ranking wire-in: only populated when search is venue-scoped (a
  // venueId is supplied). Absent (undefined) on the default public path so the
  // existing response shape is preserved for every non-venue caller.
  readiness_score?: number | null;
  preferred_tier?: PreferredTier | string | null;
};

export interface SearchFilters {
  q?: string;          // free text over name / about / category
  kind?: string;       // venue | vendor | planner | supplier | installer
  category?: string;   // vendor category (38.1)
  region?: string;     // geography (38.1 / 38.2)
  city?: string;
  capacity_min?: number; // venue capacity (38.2)
  rating_min?: number;
  premier?: boolean;   // premier-only listings
  sort?: string;
  limit?: number;
  offset?: number;
  /**
   * Phase 4 ranking wire-in (optional). When a venue id is supplied, vendor
   * results are scored with marketplaceRankingScore (vendor readiness +
   * the venue's preferred tier for that vendor) and ordered by it, descending.
   * When ABSENT, search behaves exactly as before (the public default path).
   */
  venueId?: string;
}

/**
 * Search published profiles. Returns only public, approved fields. The base
 * `profiles.published_status = 'published'` gate ensures unpublished or claimed
 * but unverified profiles never appear.
 */
export async function search(filters: SearchFilters): Promise<MarketplaceResult[]> {
  const params: unknown[] = [];
  const where: string[] = [`p.published_status = 'published'`];

  if (filters.kind) {
    params.push(filters.kind);
    where.push(`p.kind = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q.toLowerCase()}%`);
    const i = params.length;
    where.push(
      `(lower(coalesce(o.name,'')) like $${i} or lower(coalesce(p.about,'')) like $${i}
        or lower(coalesce(vd.category,'')) like $${i})`,
    );
  }
  if (filters.category) {
    params.push(filters.category);
    where.push(`vd.category = $${params.length}`);
  }
  if (filters.region) {
    params.push(filters.region);
    where.push(`(ve.region = $${params.length} or vd.organization_id is not null)`);
  }
  if (filters.city) {
    params.push(filters.city);
    where.push(`ve.city = $${params.length}`);
  }
  if (filters.capacity_min != null) {
    params.push(filters.capacity_min);
    where.push(`coalesce(ve.capacity,0) >= $${params.length}`);
  }
  if (filters.rating_min != null) {
    params.push(filters.rating_min);
    where.push(`coalesce(ve.review_score, vd.review_score, 0) >= $${params.length}`);
  }
  if (filters.premier) {
    where.push(`coalesce(vd.premier_status,false) = true`);
  }

  const sort: Sort = (SORTS as readonly string[]).includes(filters.sort ?? "")
    ? (filters.sort as Sort)
    : "relevance";
  const orderBy =
    sort === "rating"
      ? `coalesce(ve.review_score, vd.review_score, 0) desc`
      : sort === "newest"
        ? `p.created_at desc`
        : sort === "name"
          ? `o.name asc`
          : // relevance: premier first, then rating, then preferred
            `coalesce(vd.premier_status,false) desc, coalesce(ve.review_score, vd.review_score, 0) desc, coalesce(vd.preferred_status,false) desc`;

  const limit = Math.min(Math.max(filters.limit ?? 60, 1), 100);
  const offset = Math.max(filters.offset ?? 0, 0);

  // Phase 4 ranking wire-in. WHEN a venueId is supplied, left join the vendor's
  // stored readiness score and the venue's preferred tier for that vendor, then
  // order vendors by marketplaceRankingScore (readiness + tier bonus), highest
  // first. WHEN absent, fall through to the EXISTING default path unchanged.
  if (filters.venueId) {
    params.push(filters.venueId); // $N: the ranking-context venue id
    const venueParam = params.length;
    params.push(limit, offset);
    const rows = await q<MarketplaceResult>(
      `select p.slug, p.kind, o.id as organization_id, o.name, p.about,
              ve.region, ve.city, vd.category, ve.capacity,
              coalesce(ve.review_score, vd.review_score) as review_score,
              coalesce(vd.preferred_status,false) as preferred,
              coalesce(vd.premier_status,false) as premier,
              p.hero, p.theme,
              vr.score as readiness_score,
              pv.tier as preferred_tier
         from profiles p
         join organizations o on o.id = p.organization_id
         left join venues ve on ve.organization_id = o.id
         left join vendors vd on vd.organization_id = o.id
         left join vendor_readiness vr on vr.vendor_id = vd.id
         left join preferred_vendors pv on pv.vendor_id = vd.id and pv.venue_id = $${venueParam}
        where ${where.join(" and ")}
        order by ${orderBy}
        limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    // Stable, deterministic re-rank by the combined ranking score, descending.
    // Equal scores keep the SQL order (the existing relevance/sort ordering).
    const indexed = rows.map((r, i) => ({ r, i }));
    indexed.sort(
      (a, b) =>
        marketplaceRankingScore(b.r) - marketplaceRankingScore(a.r) || a.i - b.i,
    );
    return indexed.map((x) => x.r);
  }

  params.push(limit, offset);

  return q<MarketplaceResult>(
    `select p.slug, p.kind, o.id as organization_id, o.name, p.about,
            ve.region, ve.city, vd.category, ve.capacity,
            coalesce(ve.review_score, vd.review_score) as review_score,
            coalesce(vd.preferred_status,false) as preferred,
            coalesce(vd.premier_status,false) as premier,
            p.hero, p.theme
       from profiles p
       join organizations o on o.id = p.organization_id
       left join venues ve on ve.organization_id = o.id
       left join vendors vd on vd.organization_id = o.id
      where ${where.join(" and ")}
      order by ${orderBy}
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
}

/** Distinct filter facets for the search UI (categories, regions, kinds). */
export async function facets(): Promise<{
  kinds: string[];
  categories: string[];
  regions: string[];
}> {
  const kinds = await q<{ k: string }>(
    `select distinct kind as k from profiles where published_status='published' and kind is not null order by 1`,
  );
  const categories = await q<{ c: string }>(
    `select distinct vd.category as c from vendors vd
       join profiles p on p.organization_id = vd.organization_id and p.published_status='published'
      where vd.category is not null order by 1`,
  );
  const regions = await q<{ r: string }>(
    `select distinct ve.region as r from venues ve
       join profiles p on p.organization_id = ve.organization_id and p.published_status='published'
      where ve.region is not null order by 1`,
  );
  return {
    kinds: kinds.map((x) => x.k),
    categories: categories.map((x) => x.c),
    regions: regions.map((x) => x.r),
  };
}

export type SeoProfile = {
  slug: string | null;
  kind: string | null;
  name: string | null;
  about: string | null;
  region: string | null;
  city: string | null;
  category: string | null;
  subcategories: string[] | null;
  capacity: number | null;
  amenities: string[] | null;
  review_score: number | null;
  preferred: boolean;
  premier: boolean;
  hero: unknown;
  theme: unknown;
  sections: unknown;
  source_label: string;
};

/**
 * Public SEO profile by slug. Returns approved, clearly-labeled PUBLIC fields
 * only - never pricing internals, documents, or contact rows. Throws 404 if the
 * profile is missing or not published.
 */
export async function seoProfile(slug: string): Promise<SeoProfile> {
  const row = await q1<SeoProfile>(
    `select p.slug, p.kind, o.name, p.about,
            ve.region, ve.city, vd.category, vd.subcategories,
            ve.capacity, ve.amenities,
            coalesce(ve.review_score, vd.review_score) as review_score,
            coalesce(vd.preferred_status,false) as preferred,
            coalesce(vd.premier_status,false) as premier,
            p.hero, p.theme, p.sections,
            'Listing information shown is public and provided by the partner' as source_label
       from profiles p
       join organizations o on o.id = p.organization_id
       left join venues ve on ve.organization_id = o.id
       left join vendors vd on vd.organization_id = o.id
      where p.slug = $1 and p.published_status = 'published'`,
    [slug],
  );
  if (!row) throw new NotFoundError("profile not found");
  return row;
}
