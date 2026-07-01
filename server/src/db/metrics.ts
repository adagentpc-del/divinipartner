/**
 * Wave 5 - dashboard metrics query helpers (read-only analytics).
 *
 * These helpers aggregate over the existing revenue / marketplace ledgers so the
 * Venue, Vendor, and Admin dashboards can surface money + marketplace numbers
 * WITHOUT any money-flow change. Every read is parameterized and degrades to
 * zeros / empty when a source ledger table is absent (partially-migrated db),
 * exactly like the platform-revenue route.
 *
 * Source tables (already exist):
 *   platform_revenue      - per-payment platform fee accrual (db/schema-rev-accrual.sql
 *                           + db/schema-venue-revshare.sql audit columns)
 *   venue_revenue_share   - per-payment venue share (db/schema-venue-revshare.sql)
 *   events / venues / vendors / quotes / event_inquiries / payments / invoices
 *
 * Amounts are integer cents in the ledgers. Helpers return cents; the routes
 * pass them through and the dashboards format for display.
 *
 * Zero em dashes.
 */
import { q, q1 } from "../pool.js";

/** True when a public table/view exists. Mirrors the platform-revenue route. */
export async function tableExists(name: string): Promise<boolean> {
  const row = await q1<{ reg: string | null }>(`select to_regclass($1) as reg`, [`public.${name}`]);
  return !!row?.reg;
}

/** Coerce a pg numeric/bigint (returned as string) to a finite number. */
export const num = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(x) ? x : 0;
};

// ---------------------------------------------------------------------------
// VENUE metrics: scoped to the caller's venue org via venue_revenue_share.
// ---------------------------------------------------------------------------
export type VenueMetrics = {
  bookings_generated: number; // distinct events that produced a share for this org
  revenue_generated_cents: number; // GMV at this venue (sum of base_cents)
  revenue_share_earned_cents: number; // collected + paid share (realized)
  pending_revenue_share_cents: number; // accrued + invoiced share (owed)
  lifetime_revenue_share_cents: number; // all non-void/non-waived share, all time
};

export async function venueMetrics(orgId: string): Promise<VenueMetrics> {
  const empty: VenueMetrics = {
    bookings_generated: 0,
    revenue_generated_cents: 0,
    revenue_share_earned_cents: 0,
    pending_revenue_share_cents: 0,
    lifetime_revenue_share_cents: 0,
  };
  if (!(await tableExists("venue_revenue_share"))) return empty;
  const r = await q1<Record<string, string>>(
    `select
       count(distinct event_id) filter (where event_id is not null) as bookings_generated,
       coalesce(sum(base_cents),0)                                   as revenue_generated_cents,
       coalesce(sum(share_cents) filter (where status in ('collected','paid')),0)   as revenue_share_earned_cents,
       coalesce(sum(share_cents) filter (where status in ('accrued','invoiced')),0) as pending_revenue_share_cents,
       coalesce(sum(share_cents) filter (where status not in ('void','waived')),0)  as lifetime_revenue_share_cents
     from venue_revenue_share
     where venue_org_id = $1`,
    [orgId],
  );
  return {
    bookings_generated: num(r?.bookings_generated),
    revenue_generated_cents: num(r?.revenue_generated_cents),
    revenue_share_earned_cents: num(r?.revenue_share_earned_cents),
    pending_revenue_share_cents: num(r?.pending_revenue_share_cents),
    lifetime_revenue_share_cents: num(r?.lifetime_revenue_share_cents),
  };
}

// ---------------------------------------------------------------------------
// VENDOR metrics: scoped to the caller's vendor org. Leads = inbound inquiries
// routed to this org (event_inquiries.vendor_id is an organization id). Quotes
// + bookings + revenue come from the vendor rows owned by this org. Marketplace
// ranking is the org's position by review_score within its primary category.
// ---------------------------------------------------------------------------
export type VendorMetrics = {
  leads_received: number;
  quotes_sent: number;
  bookings_won: number;
  revenue_generated_cents: number; // realized gross from paid payments on this vendor's events
  marketplace_rank: number | null; // 1 = top; null when not rankable
  marketplace_total: number | null; // peers in the same category (incl. self)
};

export async function vendorMetrics(orgId: string): Promise<VendorMetrics> {
  const out: VendorMetrics = {
    leads_received: 0,
    quotes_sent: 0,
    bookings_won: 0,
    revenue_generated_cents: 0,
    marketplace_rank: null,
    marketplace_total: null,
  };

  // Leads received: inbound inquiries addressed to this org (vendor_id == org id).
  if (await tableExists("event_inquiries")) {
    const r = await q1<{ c: string }>(
      `select count(*) as c from event_inquiries where vendor_id = $1`,
      [orgId],
    );
    out.leads_received = num(r?.c);
  }

  // Quotes sent + bookings won (accepted/converted) for vendors owned by this org.
  if ((await tableExists("quotes")) && (await tableExists("vendors"))) {
    const r = await q1<{ sent: string; won: string }>(
      `select
         count(*)                                                          as sent,
         count(*) filter (where qz.status in ('accepted','converted'))     as won
       from quotes qz
       join vendors v on v.id = qz.vendor_id
       where v.organization_id = $1`,
      [orgId],
    );
    out.quotes_sent = num(r?.sent);
    out.bookings_won = num(r?.won);
  }

  // Revenue generated: realized gross from paid payments on invoices for vendors
  // owned by this org. Amounts on payments/invoices are dollars (numeric), so we
  // convert to cents to keep one unit across the response.
  if (
    (await tableExists("payments")) &&
    (await tableExists("invoices")) &&
    (await tableExists("vendors"))
  ) {
    const r = await q1<{ gross: string }>(
      `select coalesce(sum(round(p.amount * 100)),0) as gross
         from payments p
         join invoices i on i.id = p.invoice_id
         join vendors v on v.id = i.vendor_id
        where v.organization_id = $1
          and p.status in ('paid','succeeded','completed','captured','payment_received')`,
      [orgId],
    );
    out.revenue_generated_cents = num(r?.gross);
  }

  // Marketplace ranking: position of this org's vendor by review_score within its
  // primary category. Deterministic, read-only, parameterized.
  if (await tableExists("vendors")) {
    const r = await q1<{ rnk: string; total: string }>(
      `with mine as (
         select category, coalesce(review_score, 0) as score
           from vendors
          where organization_id = $1
          order by coalesce(review_score, 0) desc
          limit 1
       ),
       peers as (
         select v.id, coalesce(v.review_score, 0) as score
           from vendors v, mine
          where coalesce(v.category, '') = coalesce(mine.category, '')
       )
       select
         (select count(*) + 1 from peers, mine where peers.score > mine.score) as rnk,
         (select count(*) from peers)                                          as total
       from mine`,
      [orgId],
    );
    if (r) {
      out.marketplace_rank = num(r.rnk) || null;
      out.marketplace_total = num(r.total) || null;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// ADMIN metrics: platform-wide rollup over platform_revenue + venue_revenue_share.
// ---------------------------------------------------------------------------
export type AdminDashboardMetrics = {
  gross_marketplace_volume_cents: number; // sum of base_cents across the fee ledger
  platform_fees_collected_cents: number; // collected platform fee
  venue_revenue_share_paid_cents: number; // venue share collected + paid out
  net_platform_revenue_cents: number; // fees - venue share paid - processing cost
  top_venues: Array<{ venue_org_id: string; organization_name: string | null; share_cents: number }>;
  top_vendors: Array<{ organization_id: string; organization_name: string | null; revenue_cents: number }>;
};

export async function adminDashboardMetrics(): Promise<{
  metrics: AdminDashboardMetrics;
  available: boolean;
}> {
  const empty: AdminDashboardMetrics = {
    gross_marketplace_volume_cents: 0,
    platform_fees_collected_cents: 0,
    venue_revenue_share_paid_cents: 0,
    net_platform_revenue_cents: 0,
    top_venues: [],
    top_vendors: [],
  };
  const hasPlatform = await tableExists("platform_revenue");
  if (!hasPlatform) return { metrics: empty, available: false };

  // Gross volume + fees collected + processing cost from the platform fee ledger.
  const pr = await q1<Record<string, string>>(
    `select
       coalesce(sum(base_cents),0)                                          as gross_cents,
       coalesce(sum(fee_cents) filter (where status = 'collected'),0)       as fees_collected_cents,
       coalesce(sum(processing_cost_cents) filter (where status = 'collected'),0) as processing_cost_cents
     from platform_revenue`,
  );

  // Venue share paid (realized) from the dedicated venue ledger when present.
  let venueSharePaid = 0;
  if (await tableExists("venue_revenue_share")) {
    const vs = await q1<{ paid: string }>(
      `select coalesce(sum(share_cents) filter (where status in ('collected','paid')),0) as paid
         from venue_revenue_share`,
    );
    venueSharePaid = num(vs?.paid);
  } else {
    // Fall back to the audit column on platform_revenue.
    const vs = await q1<{ paid: string }>(
      `select coalesce(sum(venue_share_cents) filter (where status = 'collected'),0) as paid
         from platform_revenue`,
    );
    venueSharePaid = num(vs?.paid);
  }

  const grossVolume = num(pr?.gross_cents);
  const feesCollected = num(pr?.fees_collected_cents);
  const processingCost = num(pr?.processing_cost_cents);
  const netPlatform = feesCollected - venueSharePaid - processingCost;

  // Top venues by share earned (lifetime, excluding void/waived).
  let topVenues: AdminDashboardMetrics["top_venues"] = [];
  if (await tableExists("venue_revenue_share")) {
    topVenues = (
      await q<{ venue_org_id: string; organization_name: string | null; share_cents: string }>(
        `select vrs.venue_org_id,
                o.name as organization_name,
                coalesce(sum(vrs.share_cents),0) as share_cents
           from venue_revenue_share vrs
           left join organizations o on o.id = vrs.venue_org_id
          where vrs.venue_org_id is not null
            and vrs.status not in ('void','waived')
          group by vrs.venue_org_id, o.name
          order by share_cents desc
          limit 5`,
      )
    ).map((row) => ({
      venue_org_id: row.venue_org_id,
      organization_name: row.organization_name,
      share_cents: num(row.share_cents),
    }));
  }

  // Top vendors by revenue (the org attributed on the fee ledger, gross volume).
  const topVendors = (
    await q<{ organization_id: string; organization_name: string | null; revenue_cents: string }>(
      `select pr.organization_id,
              o.name as organization_name,
              coalesce(sum(pr.base_cents),0) as revenue_cents
         from platform_revenue pr
         left join organizations o on o.id = pr.organization_id
        where pr.organization_id is not null
          and pr.status not in ('void','waived')
        group by pr.organization_id, o.name
        order by revenue_cents desc
        limit 5`,
    )
  ).map((row) => ({
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    revenue_cents: num(row.revenue_cents),
  }));

  return {
    metrics: {
      gross_marketplace_volume_cents: grossVolume,
      platform_fees_collected_cents: feesCollected,
      venue_revenue_share_paid_cents: venueSharePaid,
      net_platform_revenue_cents: netPlatform,
      top_venues: topVenues,
      top_vendors: topVendors,
    },
    available: true,
  };
}
