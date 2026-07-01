/**
 * Phase 8 - Super Admin Intelligence (blueprint section 44).
 *
 * Read-only analytics computed from the EXISTING tables (organizations, users,
 * events, bids, quotes, invoices, payments, disputes, support_tickets,
 * feedback_items). Nothing is fabricated: every number is a SQL aggregate over
 * real rows. All functions assume `requireAdmin` ran at the route layer.
 *
 * Metrics surfaced:
 *   - GMV (gross merchandise value) + platform fee revenue + MRR
 *   - top vendors / venues by volume
 *   - bid volume + quote conversion rate
 *   - category + geographic demand
 *   - churn risk + upgrade opportunities
 *   - open disputes / tickets + incomplete onboarding
 *   - white-label candidates
 */
import { q, q1 } from "../pool.js";
import { TIERS } from "../db.js";

export interface AdminMetrics {
  generated_at: string;
  money: {
    gmv: number;
    platform_fee_revenue: number;
    mrr: number;
    paid_invoices: number;
  };
  marketplace: {
    bid_volume: number;
    quotes_submitted: number;
    quotes_accepted: number;
    quote_conversion_rate: number;
  };
  accounts: {
    total: number;
    by_tier: { tier: string; count: number }[];
    incomplete_onboarding: number;
    churn_risk: number;
    upgrade_opportunities: number;
    white_label_candidates: number;
  };
  attention: {
    open_disputes: number;
    open_tickets: number;
    pending_verification: number;
  };
  top_vendors: { organization_id: string; name: string; quotes: number; volume: number }[];
  top_venues: { venue_id: string; name: string; events: number }[];
  category_demand: { category: string; bids: number }[];
  geo_demand: { region: string; events: number }[];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** MRR from the configured tier monthly prices times active partner orgs. */
async function computeMrr(): Promise<number> {
  const rows = await q<{ tier: string; count: number }>(
    `select tier, count(*)::int as count from organizations
      where tier is not null group by tier`,
  );
  let mrr = 0;
  for (const r of rows) {
    const t = (TIERS as Record<string, { monthly: number } | undefined>)[r.tier];
    if (t) mrr += t.monthly * r.count;
  }
  return mrr;
}

export async function getMetrics(): Promise<AdminMetrics> {
  // ---- money ----
  const money = await q1<{ gmv: string; fees: string; paid: number }>(
    `select coalesce(sum(total),0) as gmv,
            coalesce(sum(platform_fee),0) as fees,
            count(*) filter (where status = 'paid')::int as paid
       from invoices`,
  );
  const mrr = await computeMrr();

  // ---- marketplace ----
  const bidVol = await q1<{ c: number }>(`select count(*)::int as c from bids`);
  const quotes = await q1<{ submitted: number; accepted: number }>(
    `select count(*) filter (where status in ('submitted','viewed','revision_requested','revised','accepted','declined','expired','converted'))::int as submitted,
            count(*) filter (where status in ('accepted','converted'))::int as accepted
       from quotes`,
  );
  const submitted = num(quotes?.submitted);
  const accepted = num(quotes?.accepted);
  const conversion = submitted > 0 ? Math.round((accepted / submitted) * 1000) / 10 : 0;

  // ---- accounts ----
  const total = await q1<{ c: number }>(`select count(*)::int as c from organizations`);
  const byTier = await q<{ tier: string; count: number }>(
    `select coalesce(tier,'unknown') as tier, count(*)::int as count
       from organizations group by 1 order by 2 desc`,
  );
  // incomplete onboarding: users with no organization, or orgs still in draft verification
  const incomplete = await q1<{ c: number }>(
    `select (
       (select count(*) from users where organization_id is null)
       + (select count(*) from organizations where coalesce(verification_status,'draft') = 'draft')
     )::int as c`,
  );
  // churn risk: partner+ orgs with no events in 90 days
  const churn = await q1<{ c: number }>(
    `select count(*)::int as c from organizations o
      where o.tier in ('partner','premier','white_label')
        and not exists (
          select 1 from events e
           where e.organization_id = o.id and e.created_at > now() - interval '90 days')`,
  );
  // upgrade opportunities: free_partner orgs that have submitted quotes (engaged but unpaid tier)
  const upgrade = await q1<{ c: number }>(
    `select count(distinct o.id)::int as c from organizations o
       join vendors v on v.organization_id = o.id
       join quotes q on q.vendor_id = v.id
      where o.tier = 'free_partner'`,
  );
  // white-label candidates: high-volume partner/premier not already white_label
  const wlCandidates = await q1<{ c: number }>(
    `select count(*)::int as c from organizations o
      where o.tier in ('partner','premier')
        and coalesce(o.white_label_status,'not_eligible') in ('not_eligible','potential_fit')
        and exists (select 1 from events e where e.organization_id = o.id)`,
  );

  // ---- attention ----
  const disputes = await q1<{ c: number }>(
    `select count(*)::int as c from disputes
      where status not in ('resolved','refunded','denied','cancelled','closed')`,
  );
  const tickets = await q1<{ c: number }>(
    `select count(*)::int as c from support_tickets
      where coalesce(status,'open') not in ('resolved','closed')`,
  );
  const pendingVerif = await q1<{ c: number }>(
    `select count(*)::int as c from organizations
      where coalesce(verification_status,'draft') in ('draft','pending','submitted')`,
  );

  // ---- top vendors (by quotes + quoted volume) ----
  const topVendors = await q<{ organization_id: string; name: string; quotes: number; volume: string }>(
    `select o.id as organization_id, o.name,
            count(q.id)::int as quotes, coalesce(sum(q.total),0) as volume
       from organizations o
       join vendors v on v.organization_id = o.id
       join quotes q on q.vendor_id = v.id
      group by o.id, o.name
      order by quotes desc, volume desc
      limit 10`,
  );

  // ---- top venues (by events) ----
  const topVenues = await q<{ venue_id: string; name: string; events: number }>(
    `select ve.id as venue_id, ve.name, count(e.id)::int as events
       from venues ve
       join events e on e.venue_id = ve.id
      group by ve.id, ve.name
      order by events desc
      limit 10`,
  );

  // ---- category demand (bids by category) ----
  const categoryDemand = await q<{ category: string; bids: number }>(
    `select coalesce(category,'uncategorized') as category, count(*)::int as bids
       from bids group by 1 order by 2 desc limit 12`,
  );

  // ---- geographic demand (events by venue region) ----
  const geoDemand = await q<{ region: string; events: number }>(
    `select coalesce(ve.region,'unknown') as region, count(e.id)::int as events
       from events e left join venues ve on ve.id = e.venue_id
      group by 1 order by 2 desc limit 12`,
  );

  return {
    generated_at: new Date().toISOString(),
    money: {
      gmv: num(money?.gmv),
      platform_fee_revenue: num(money?.fees),
      mrr,
      paid_invoices: num(money?.paid),
    },
    marketplace: {
      bid_volume: num(bidVol?.c),
      quotes_submitted: submitted,
      quotes_accepted: accepted,
      quote_conversion_rate: conversion,
    },
    accounts: {
      total: num(total?.c),
      by_tier: byTier,
      incomplete_onboarding: num(incomplete?.c),
      churn_risk: num(churn?.c),
      upgrade_opportunities: num(upgrade?.c),
      white_label_candidates: num(wlCandidates?.c),
    },
    attention: {
      open_disputes: num(disputes?.c),
      open_tickets: num(tickets?.c),
      pending_verification: num(pendingVerif?.c),
    },
    top_vendors: topVendors.map((r) => ({
      organization_id: r.organization_id,
      name: r.name,
      quotes: num(r.quotes),
      volume: num(r.volume),
    })),
    top_venues: topVenues.map((r) => ({
      venue_id: r.venue_id,
      name: r.name,
      events: num(r.events),
    })),
    category_demand: categoryDemand,
    geo_demand: geoDemand,
  };
}

// ----------------------------------------------------------------------------
// ACCOUNT MANAGEMENT (blueprint 44 - approvals / suspend / merge surfacing)
// ----------------------------------------------------------------------------
export type AccountRow = {
  id: string;
  name: string;
  type: string | null;
  tier: string | null;
  verification_status: string | null;
  white_label_status: string | null;
  subscription_status: string | null;
  user_count: number;
  created_at: string;
};

/** List organizations with member counts (admin account manager). */
export async function listAccounts(filter: {
  verification_status?: string;
  tier?: string;
}): Promise<AccountRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filter.verification_status) {
    params.push(filter.verification_status);
    where.push(`coalesce(o.verification_status,'draft') = $${params.length}`);
  }
  if (filter.tier) {
    params.push(filter.tier);
    where.push(`o.tier = $${params.length}`);
  }
  return q<AccountRow>(
    `select o.id, o.name, o.type, o.tier, o.verification_status, o.white_label_status,
            o.subscription_status,
            (select count(*)::int from users u where u.organization_id = o.id) as user_count,
            o.created_at
       from organizations o
       ${where.length ? `where ${where.join(" and ")}` : ""}
      order by o.created_at desc
      limit 500`,
    params,
  );
}

/** Set an org's verification status (approve / reject / suspend). Returns prev+next. */
export async function setVerification(
  orgId: string,
  status: string,
): Promise<{ prev: AccountRow | null; next: AccountRow }> {
  const prev = await q1<AccountRow>(
    `select o.id, o.name, o.type, o.tier, o.verification_status, o.white_label_status,
            o.subscription_status, 0 as user_count, o.created_at
       from organizations o where o.id = $1`,
    [orgId],
  );
  const next = await q1<AccountRow>(
    `update organizations set verification_status = $2, updated_at = now()
      where id = $1
      returning id, name, type, tier, verification_status, white_label_status,
                subscription_status, 0 as user_count, created_at`,
    [orgId, status],
  );
  if (!next) throw new Error("organization not found");
  return { prev, next };
}

/** Set subscription status (suspend / reactivate an account). Returns prev+next. */
export async function setSubscription(
  orgId: string,
  status: string,
): Promise<{ prev: AccountRow | null; next: AccountRow }> {
  const prev = await q1<AccountRow>(
    `select o.id, o.name, o.type, o.tier, o.verification_status, o.white_label_status,
            o.subscription_status, 0 as user_count, o.created_at
       from organizations o where o.id = $1`,
    [orgId],
  );
  const next = await q1<AccountRow>(
    `update organizations set subscription_status = $2, updated_at = now()
      where id = $1
      returning id, name, type, tier, white_label_status, verification_status,
                subscription_status, 0 as user_count, created_at`,
    [orgId, status],
  );
  if (!next) throw new Error("organization not found");
  return { prev, next };
}
