/**
 * Module 8 - Super Admin Revenue Center routes. Mount base: /api/revenue-center.
 * SUPER-ADMIN ONLY (requireAdmin). Deterministic, real-data-only aggregation.
 *
 * Every cross-workstream read is probed by NAME with to_regclass first and
 * degrades to zero when the table is absent, so this endpoint never throws on a
 * partially-migrated database. Money is reported in cents where the source is
 * in cents, and in dollars (numeric) where the source is numeric; each section
 * documents its unit. Estimates are labeled.
 *
 * Sections:
 *   subscription  - MRR / ARR / active subscriptions (PLANS + planForOrg)
 *   transaction   - platform fees, capped-transaction count, gross volume
 *   referral      - partner commissions (pending/paid), credits outstanding
 *   marketplace   - active orgs by type + active events
 *   growth        - referral conversions, new orgs, churn + LTV estimates
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAdmin } from "../auth.js";
import { q, q1 } from "../pool.js";
import { PLANS, planForOrg, computePlatformFee } from "../lib/platformFees.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** True if a relation exists (table or view), via to_regclass. */
async function tableExists(name: string): Promise<boolean> {
  const row = await q1<{ reg: string | null }>(`select to_regclass($1) as reg`, [name]);
  return !!row?.reg;
}

const n = (v: unknown): number => {
  const x = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(x) ? x : 0;
};

// ---------------------------------------------------------------------------
// SUBSCRIPTION: MRR / ARR from active partner/premier orgs via PLANS.
// organizations.tier drives the plan; monthlyCents comes from PLANS.
// ---------------------------------------------------------------------------
async function subscriptionSection() {
  if (!(await tableExists("organizations"))) {
    return { mrr_cents: 0, arr_cents: 0, active_subscriptions: 0, by_plan: {}, available: false };
  }
  const rows = await q<{ tier: string | null; platform_fee_rate: string | null; subscription_status: string | null }>(
    `select tier, platform_fee_rate, subscription_status from organizations`,
  );
  let mrrCents = 0;
  let activeSubs = 0;
  const byPlan: Record<string, { count: number; mrr_cents: number }> = {};
  for (const o of rows) {
    // "Active" subscription: not explicitly suspended/cancelled.
    const status = (o.subscription_status ?? "").toLowerCase();
    const isInactive = status === "suspended" || status === "cancelled" || status === "canceled";
    if (isInactive) continue;
    const planKey = planForOrg({ tier: o.tier, platform_fee_rate: n(o.platform_fee_rate) || null });
    const monthly = PLANS[planKey].monthlyCents;
    if (monthly > 0) {
      mrrCents += monthly;
      activeSubs += 1;
      byPlan[planKey] = byPlan[planKey] ?? { count: 0, mrr_cents: 0 };
      byPlan[planKey].count += 1;
      byPlan[planKey].mrr_cents += monthly;
    }
  }
  return {
    mrr_cents: mrrCents,
    arr_cents: mrrCents * 12,
    active_subscriptions: activeSubs,
    by_plan: byPlan,
    available: true,
  };
}

// ---------------------------------------------------------------------------
// TRANSACTION: platform fees collected + gross volume + capped count.
// payments.platform_fee + payments.amount are numeric (dollars). Where a
// payment has no recorded platform_fee we estimate via computePlatformFee using
// the payer org's tier (best-effort; labeled as an estimate component).
// ---------------------------------------------------------------------------
async function transactionSection() {
  if (!(await tableExists("payments"))) {
    return {
      platform_fees_dollars: 0,
      estimated_fees_dollars: 0,
      gross_volume_dollars: 0,
      capped_transaction_count: 0,
      payment_count: 0,
      available: false,
      note: "payments table not present",
    };
  }
  // Recorded fees + volume on settled/received payments.
  const agg = await q1<{ recorded_fee: string | null; volume: string | null; cnt: string | null }>(
    `select coalesce(sum(platform_fee),0) as recorded_fee,
            coalesce(sum(amount),0) as volume,
            count(*) as cnt
       from payments
      where coalesce(status,'') not in ('failed','cancelled','voided')`,
  );
  const recordedFee = n(agg?.recorded_fee);
  const volume = n(agg?.volume);
  const paymentCount = n(agg?.cnt);

  // Estimate fees for payments missing a recorded platform_fee. We join the
  // payer org tier through invoices -> organizations when available.
  let estimatedFee = 0;
  let cappedCount = 0;
  const hasInvoices = await tableExists("invoices");
  const hasOrgs = await tableExists("organizations");
  if (hasInvoices && hasOrgs) {
    const missing = await q<{ amount: string | null; tier: string | null; platform_fee_rate: string | null }>(
      `select p.amount, o.tier, o.platform_fee_rate
         from payments p
         join invoices i on i.id = p.invoice_id
         left join organizations o on o.id = i.organization_id
        where (p.platform_fee is null or p.platform_fee = 0)
          and coalesce(p.status,'') not in ('failed','cancelled','voided')
        limit 5000`,
    );
    for (const m of missing) {
      const amountCents = Math.round(n(m.amount) * 100);
      const r = computePlatformFee(amountCents, { tier: m.tier, platform_fee_rate: n(m.platform_fee_rate) || null });
      estimatedFee += r.platformFeeCents / 100;
      if (r.capApplied) cappedCount += 1;
    }
  }
  return {
    platform_fees_dollars: Math.round(recordedFee * 100) / 100,
    estimated_fees_dollars: Math.round(estimatedFee * 100) / 100,
    gross_volume_dollars: Math.round(volume * 100) / 100,
    capped_transaction_count: cappedCount,
    payment_count: paymentCount,
    available: true,
    note: "estimated_fees_dollars covers payments with no recorded platform_fee",
  };
}

// ---------------------------------------------------------------------------
// REFERRAL: partner commissions (owed/pending/paid) + credits outstanding.
// partner_commissions.commission_cents/status; partner_payouts may not exist.
// platform_credits is an append-only ledger: outstanding = earned - redeemed - expired.
// ---------------------------------------------------------------------------
async function referralSection() {
  const out: Record<string, unknown> = {};

  if (await tableExists("partner_commissions")) {
    const c = await q1<{ pending: string | null; paid: string | null; total: string | null }>(
      `select
         coalesce(sum(commission_cents) filter (where status in ('pending','approved','accrued')),0) as pending,
         coalesce(sum(commission_cents) filter (where status in ('paid','settled')),0) as paid,
         coalesce(sum(commission_cents) filter (where coalesce(excluded,false) = false),0) as total
       from partner_commissions`,
    );
    out.commissions = {
      pending_cents: n(c?.pending),
      paid_cents: n(c?.paid),
      total_cents: n(c?.total),
      available: true,
    };
  } else {
    out.commissions = { pending_cents: 0, paid_cents: 0, total_cents: 0, available: false };
  }

  if (await tableExists("partner_payouts")) {
    const p = await q1<{ sent: string | null; pending: string | null }>(
      `select
         coalesce(sum(commission_paid_cents) filter (where status = 'paid'),0) as sent,
         coalesce(sum(commission_owed_cents - commission_paid_cents) filter (where status in ('pending','awaiting_tax_info','awaiting_bank_info','approved','scheduled','held')),0) as pending
       from partner_payouts`,
    );
    out.payouts = { sent_cents: n(p?.sent), pending_cents: n(p?.pending), available: true };
  } else {
    out.payouts = { sent_cents: 0, pending_cents: 0, available: false };
  }

  if (await tableExists("platform_credits")) {
    const cr = await q1<{ outstanding: string | null }>(
      `select
         coalesce(sum(amount_cents) filter (where kind = 'earned'),0)
       - coalesce(sum(amount_cents) filter (where kind = 'redeemed'),0)
       - coalesce(sum(amount_cents) filter (where kind = 'expired'),0) as outstanding
       from platform_credits`,
    );
    out.credits_outstanding_cents = n(cr?.outstanding);
    out.credits_available = true;
  } else {
    out.credits_outstanding_cents = 0;
    out.credits_available = false;
  }

  return out;
}

// ---------------------------------------------------------------------------
// MARKETPLACE: active counts by org type + active events.
// ---------------------------------------------------------------------------
async function marketplaceSection() {
  const out: Record<string, unknown> = { by_type: {}, active_events: 0, available: false };
  if (await tableExists("organizations")) {
    const rows = await q<{ type: string | null; cnt: string | null }>(
      `select lower(coalesce(type,'unknown')) as type, count(*) as cnt
         from organizations
        where coalesce(subscription_status,'') not in ('suspended','cancelled','canceled')
        group by lower(coalesce(type,'unknown'))`,
    );
    const byType: Record<string, number> = {};
    for (const r of rows) byType[r.type ?? "unknown"] = n(r.cnt);
    out.by_type = byType;
    out.available = true;
  }
  if (await tableExists("events")) {
    const ev = await q1<{ cnt: string | null }>(
      `select count(*) as cnt from events
        where coalesce(status,'') not in ('closed','archived','completed')`,
    );
    out.active_events = n(ev?.cnt);
  }
  return out;
}

// ---------------------------------------------------------------------------
// ACCRUAL LEDGER: the platform_revenue accrued-fee ledger (Money-loop close).
// One row per recorded payment; fee_cents in CENTS. Rolled up by status so the
// admin sees what is accrued (owed but not yet collected), invoiced, collected,
// waived, and voided, plus the referral split that was accrued alongside.
// Degrades to zeros + available:false when the ledger table is absent.
// ---------------------------------------------------------------------------
async function accrualSection() {
  if (!(await tableExists("platform_revenue"))) {
    return {
      accrued_cents: 0,
      invoiced_cents: 0,
      collected_cents: 0,
      waived_cents: 0,
      void_cents: 0,
      referral_split_cents: 0,
      row_count: 0,
      available: false,
    };
  }
  const r = await q1<{
    accrued: string | null;
    invoiced: string | null;
    collected: string | null;
    waived: string | null;
    voided: string | null;
    referral_split: string | null;
    cnt: string | null;
  }>(
    `select
       coalesce(sum(fee_cents) filter (where status = 'accrued'),0)   as accrued,
       coalesce(sum(fee_cents) filter (where status = 'invoiced'),0)  as invoiced,
       coalesce(sum(fee_cents) filter (where status = 'collected'),0) as collected,
       coalesce(sum(fee_cents) filter (where status = 'waived'),0)    as waived,
       coalesce(sum(fee_cents) filter (where status = 'void'),0)      as voided,
       coalesce(sum(referral_split_cents) filter (where status <> 'void'),0) as referral_split,
       count(*) as cnt
     from platform_revenue`,
  );
  return {
    accrued_cents: n(r?.accrued),
    invoiced_cents: n(r?.invoiced),
    collected_cents: n(r?.collected),
    waived_cents: n(r?.waived),
    void_cents: n(r?.voided),
    referral_split_cents: n(r?.referral_split),
    row_count: n(r?.cnt),
    available: true,
  };
}

// ---------------------------------------------------------------------------
// GROWTH: referral conversions, new orgs in window, churn + LTV estimates.
// ---------------------------------------------------------------------------
async function growthSection(windowDays: number) {
  const out: Record<string, unknown> = {};

  // Referral conversions.
  if (await tableExists("user_referrals")) {
    const ref = await q1<{ converted: string | null; total: string | null }>(
      `select
         count(*) filter (where status = 'converted') as converted,
         count(*) as total
       from user_referrals`,
    );
    const converted = n(ref?.converted);
    const total = n(ref?.total);
    out.referral_conversions = converted;
    out.referral_total = total;
    out.referral_conversion_rate = total > 0 ? Math.round((converted / total) * 1000) / 1000 : 0;
  } else {
    out.referral_conversions = 0;
    out.referral_total = 0;
    out.referral_conversion_rate = 0;
  }

  // New organizations in the window + churn estimate.
  let newOrgs = 0;
  let churnEstimate = 0;
  let ltvEstimateCents = 0;
  if (await tableExists("organizations")) {
    const created = await q1<{ cnt: string | null }>(
      `select count(*) as cnt from organizations
        where created_at >= now() - ($1 || ' days')::interval`,
      [windowDays],
    );
    newOrgs = n(created?.cnt);

    // Churn estimate (LABELED ESTIMATE): suspended/cancelled orgs as a share of
    // all orgs that ever carried a paid tier.
    const churn = await q1<{ paid_total: string | null; churned: string | null }>(
      `select
         count(*) filter (where tier in ('partner','premier','white_label')) as paid_total,
         count(*) filter (where tier in ('partner','premier','white_label')
                            and coalesce(subscription_status,'') in ('suspended','cancelled','canceled')) as churned
       from organizations`,
    );
    const paidTotal = n(churn?.paid_total);
    const churned = n(churn?.churned);
    churnEstimate = paidTotal > 0 ? Math.round((churned / paidTotal) * 1000) / 1000 : 0;

    // LTV estimate (LABELED ESTIMATE): average active monthly revenue per paying
    // org * an assumed average lifetime in months (1/churn, bounded), where
    // churn is the monthly proxy above. Falls back to a 24-month lifetime when
    // churn is zero/unknown.
    const sub = await subscriptionSection();
    const activeSubs = (sub as { active_subscriptions: number }).active_subscriptions;
    const mrrCents = (sub as { mrr_cents: number }).mrr_cents;
    const avgRevPerOrg = activeSubs > 0 ? mrrCents / activeSubs : 0;
    const lifetimeMonths = churnEstimate > 0 ? Math.min(1 / churnEstimate, 60) : 24;
    ltvEstimateCents = Math.round(avgRevPerOrg * lifetimeMonths);
  }

  out.new_organizations = newOrgs;
  out.window_days = windowDays;
  out.churn_estimate = churnEstimate;
  out.churn_estimate_is_estimate = true;
  out.ltv_estimate_cents = ltvEstimateCents;
  out.ltv_estimate_is_estimate = true;
  return out;
}

const router = Router();
router.use(requireAdmin);

/** Full revenue rollup. ?windowDays=N (default 30) controls growth windows. */
router.get(
  "/",
  h(async (req, res) => {
    const windowDays = Math.min(Math.max(Number(req.query.windowDays) || 30, 1), 365);
    const [subscription, transaction, referral, accrual, marketplace, growth] = await Promise.all([
      subscriptionSection(),
      transactionSection(),
      referralSection(),
      accrualSection(),
      marketplaceSection(),
      growthSection(windowDays),
    ]);
    res.json({
      generated_at: new Date().toISOString(),
      window_days: windowDays,
      subscription,
      transaction,
      referral,
      accrual,
      marketplace,
      growth,
    });
  }),
);

export default router;
