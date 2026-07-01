/**
 * Pricing V2 - Featured Vendor advertising (record / track only).
 *
 * "Featured Vendor" is the single optional upgrade under Pricing V2 (gated on
 * the server PRICING_V2 flag). At FEATURED_VENDOR_PRICE_USD per month a vendor
 * org gets top search placement, a featured badge on marketplace cards, homepage
 * placement, and a preferred-matching ranking boost. It is ADVERTISING, not
 * membership: nothing here changes platform fees, bid access, or seats.
 *
 * Backed by featured_placements (db/schema-pricing-v2-featured.sql). One row per
 * org (upserted). Following the existing subscription-entitlement pattern this
 * module only RECORDS / TRACKS the entitlement: no live processor is called and
 * no real money moves. processor_ref is reserved for a future processor sub id.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";
import { PRICING_V2, FEATURED_VENDOR_PRICE_USD } from "../config.js";

export type FeaturedStatus = "active" | "cancelled" | "expired";

export type FeaturedPlacement = {
  id: string;
  organization_id: string;
  status: FeaturedStatus;
  price_cents: number;
  started_at: string;
  current_period_end: string | null;
  processor_ref: string | null;
  created_at: string;
  updated_at: string;
};

export type FeaturedStatusView = {
  pricing_v2: boolean;
  featured: boolean; // currently featured (status active and not lapsed)
  price_usd: number;
  price_cents: number;
  status: FeaturedStatus | null;
  current_period_end: string | null;
  started_at: string | null;
};

/** Price of the Featured Vendor upgrade in whole cents. */
export function featuredPriceCents(): number {
  return Math.round(FEATURED_VENDOR_PRICE_USD * 100);
}

/** Raw placement row for an org, or null when the org has never subscribed. */
export async function getPlacement(orgId: string): Promise<FeaturedPlacement | null> {
  return q1<FeaturedPlacement>(
    `select id, organization_id, status, price_cents, started_at,
            current_period_end, processor_ref, created_at, updated_at
       from featured_placements
      where organization_id = $1`,
    [orgId],
  );
}

/**
 * True when the org is CURRENTLY featured. Only meaningful under Pricing V2:
 * when the flag is off this always returns false so legacy behavior is intact.
 * A placement counts as featured when its status is 'active' and the paid
 * period has not lapsed (a null period end is treated as open ended / active).
 */
export async function isFeatured(orgId: string | null | undefined): Promise<boolean> {
  if (!PRICING_V2 || !orgId) return false;
  const row = await getPlacement(orgId);
  if (!row || row.status !== "active") return false;
  if (row.current_period_end && new Date(row.current_period_end).getTime() < Date.now()) {
    return false;
  }
  return true;
}

/** Batch lookup: set of org ids that are currently featured (Pricing V2 only). */
export async function featuredOrgIds(orgIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (!PRICING_V2 || orgIds.length === 0) return out;
  const rows = await q<{ organization_id: string }>(
    `select organization_id
       from featured_placements
      where status = 'active'
        and (current_period_end is null or current_period_end > now())
        and organization_id = any($1::uuid[])`,
    [orgIds],
  );
  for (const r of rows) out.add(r.organization_id);
  return out;
}

/** Status view for the vendor dashboard / profile upsell. */
export async function statusFor(orgId: string | null | undefined): Promise<FeaturedStatusView> {
  const base: FeaturedStatusView = {
    pricing_v2: PRICING_V2,
    featured: false,
    price_usd: FEATURED_VENDOR_PRICE_USD,
    price_cents: featuredPriceCents(),
    status: null,
    current_period_end: null,
    started_at: null,
  };
  if (!PRICING_V2 || !orgId) return base;
  const row = await getPlacement(orgId);
  if (!row) return base;
  base.status = row.status;
  base.current_period_end = row.current_period_end;
  base.started_at = row.started_at;
  base.featured = await isFeatured(orgId);
  return base;
}

/**
 * Buy (or re-activate) the Featured Vendor upgrade for an org. Record only: we
 * upsert an active placement and set a one month paid-through period. No live
 * processor is invoked. Idempotent on organization_id.
 */
export async function buyFeatured(orgId: string, processorRef?: string | null): Promise<FeaturedPlacement> {
  const cents = featuredPriceCents();
  return (await q1<FeaturedPlacement>(
    `insert into featured_placements
        (organization_id, status, price_cents, started_at, current_period_end, processor_ref)
      values ($1, 'active', $2, now(), now() + interval '1 month', $3)
     on conflict (organization_id) do update set
        status = 'active',
        price_cents = excluded.price_cents,
        started_at = now(),
        current_period_end = now() + interval '1 month',
        processor_ref = coalesce(excluded.processor_ref, featured_placements.processor_ref),
        updated_at = now()
     returning id, organization_id, status, price_cents, started_at,
               current_period_end, processor_ref, created_at, updated_at`,
    [orgId, cents, processorRef ?? null],
  )) as FeaturedPlacement;
}

/**
 * Cancel the Featured Vendor upgrade for an org. The row is marked cancelled
 * (kept for history). Returns the updated row, or null when there was none.
 */
export async function cancelFeatured(orgId: string): Promise<FeaturedPlacement | null> {
  return q1<FeaturedPlacement>(
    `update featured_placements
        set status = 'cancelled', updated_at = now()
      where organization_id = $1
      returning id, organization_id, status, price_cents, started_at,
                current_period_end, processor_ref, created_at, updated_at`,
    [orgId],
  );
}
