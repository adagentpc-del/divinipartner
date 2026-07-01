/**
 * Monetization hook - closes the money loop on every recorded payment.
 *
 * When a payment/booking is RECORDED on platform (db/payments.ts recordPayment /
 * recordProcessorPayment), two obligations must be accrued automatically so
 * revenue cannot silently leak:
 *
 *   1. The PLATFORM FEE the platform earned on the transaction is recorded into
 *      the platform_revenue accrual ledger (db/schema-rev-accrual.sql), exactly
 *      once per source payment.
 *   2. If the paying org was REFERRED by a partner with an agreed revenue share,
 *      that partner's profit-based split is accrued into the existing
 *      partner_commissions ledger (db/schema-rev-partner.sql) via the existing
 *      recordCommission() engine, with status 'accrued'.
 *
 * RECORD ONLY: nothing here moves money or charges anyone. It writes ledger rows.
 *
 * Idempotency: recordPlatformFee inserts with `on conflict (source_payment_id)
 * do nothing`, so a synchronous capture plus its webhook backstop, or a retried
 * insert, can never accrue the same fee twice. The referral commission is gated
 * on the platform_revenue insert having actually created the row, so it is only
 * accrued the first time a given payment is seen.
 *
 * Leakage enforcement: every on-platform payment funnels through the payments
 * DAL, which calls this hook. The platform fee cannot be skipped from a route.
 * The only way to remove an accrued obligation is an explicit admin action that
 * sets the platform_revenue.status to 'waived' or 'void'.
 *
 * The fee figures are taken from what the payment DAL already computed and
 * stored on the payment row (amount, platform_fee, processing_fee), so this hook
 * never re-derives a number and cannot drift from the recorded payment. Where
 * the row is missing a fee (defensive), it falls back to computeFees with the
 * org tier, and the platform percentage default comes from an env var.
 *
 * Amounts on the payments table are DOLLARS (numeric); the platform_revenue
 * ledger and the commission engine are in CENTS. We convert dollars to cents at
 * this boundary.
 *
 * Zero em dashes.
 */
import { q1 } from "../pool.js";
import { computeFees, type PaymentRow } from "../db/payments.js";
import { recordCommission, type RecordedCommission } from "../db/partners.js";
import type { CommissionSource } from "./partnerCommission.js";

/**
 * Default platform fee fraction used ONLY as a last-resort fallback when a
 * payment row carries no recorded platform_fee AND its org tier is unknown. The
 * per-tier rate (db.TIERS) is the real source of truth and is applied by
 * computeFees first; this constant exists so the number is never hardcoded
 * inline at a call site. Override with PLATFORM_FEE_DEFAULT_RATE.
 */
const PLATFORM_FEE_DEFAULT_RATE_FALLBACK = 0.025;

function platformFeeDefaultRate(): number {
  const raw = Number(process.env.PLATFORM_FEE_DEFAULT_RATE);
  return Number.isFinite(raw) && raw >= 0 ? raw : PLATFORM_FEE_DEFAULT_RATE_FALLBACK;
}

/**
 * Venue revenue share as a fraction of the PLATFORM FEE on each on-platform
 * transaction tied to the venue's events. Carved out of the platform fee (never
 * added to what the payer owes, never deducted from the payee). Default 20%; at
 * a flat 5% platform fee that equals 1% of gross. Scales at every booking size
 * and can never exceed the fee. Override with VENUE_SHARE_OF_FEE_V2 (0..1; set
 * to 0 to disable).
 */
const VENUE_SHARE_OF_FEE_DEFAULT = 0.2;
function venueShareOfFee(): number {
  const raw = Number(process.env.VENUE_SHARE_OF_FEE_V2);
  return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : VENUE_SHARE_OF_FEE_DEFAULT;
}

/** Dollars (numeric string or number) to integer cents. Floors negatives at 0. */
function toCents(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/** True when a relation exists (table or view), via to_regclass. Never throws. */
async function tableExists(name: string): Promise<boolean> {
  try {
    const row = await q1<{ reg: string | null }>(`select to_regclass($1) as reg`, [`public.${name}`]);
    return !!row?.reg;
  } catch {
    return false;
  }
}

/**
 * Resolve the partner that REFERRED a given org (permanent first_touch
 * attribution wins, else the most recent attribution). Read by NAME so the hook
 * degrades to null when the partner tables are absent. Never throws.
 */
async function partnerForReferredOrg(orgId: string): Promise<{
  partner_id: string;
} | null> {
  if (!orgId) return null;
  if (!(await tableExists("partner_referrals"))) return null;
  // Prefer a permanent first_touch attribution; fall back to most recent.
  const row = await q1<{ partner_id: string }>(
    `select pr.partner_id
       from partner_referrals pr
       join partners p on p.id = pr.partner_id
      where pr.referred_org_id = $1
        and coalesce(p.status,'active') = 'active'
      order by (pr.attribution = 'first_touch') desc, pr.referred_at desc
      limit 1`,
    [orgId],
  ).catch(() => null);
  return row ?? null;
}

/**
 * Resolve the hosting venue (and its owning org) for a payment via its event:
 * payments.event_id -> events.venue_id -> venues.organization_id. Returns null
 * when there is no event, no venue, or the venue tables are absent. Never throws.
 */
async function venueForPayment(payment: {
  event_id?: string | null;
}): Promise<{ venue_id: string; venue_org_id: string } | null> {
  const eventId = payment.event_id ?? null;
  if (!eventId) return null;
  if (!(await tableExists("venues"))) return null;
  const row = await q1<{ venue_id: string; venue_org_id: string | null }>(
    `select v.id as venue_id, v.organization_id as venue_org_id
       from events e
       join venues v on v.id = e.venue_id
      where e.id = $1
      limit 1`,
    [eventId],
  ).catch(() => null);
  if (!row?.venue_id || !row.venue_org_id) return null;
  return { venue_id: row.venue_id, venue_org_id: row.venue_org_id };
}

/**
 * Accrue the hosting venue's revenue share for one payment, carved out of the
 * platform fee. RECORD ONLY, idempotent per source payment, never throws.
 *
 *   share_cents = round( platform_fee_cents * VENUE_SHARE_OF_FEE )   (default 20%)
 *
 * Because the share is a fraction of the platform fee, it always scales with the
 * transaction and can never exceed the fee (so the platform's fee line stays
 * positive). At a flat 5% platform fee, 20% of the fee equals 1% of gross.
 * Skipped entirely when there is no hosting venue, the venue's own org is the
 * paying party (self-dealing), or the share rounds to 0. Writes a
 * venue_revenue_share row and backfills the venue columns on the platform_revenue
 * ledger row for a single auditable view of the carve-out.
 */
async function maybeRecordVenueShare(
  revenueId: string,
  payment: PaymentRow,
  baseCents: number,
  feeCents: number,
): Promise<{ venueOrgId: string; shareCents: number } | null> {
  try {
    const rate = venueShareOfFee();
    if (rate <= 0 || feeCents <= 0) return null;
    if (!(await tableExists("venue_revenue_share"))) return null;

    const venue = await venueForPayment(payment);
    if (!venue) return null;
    // Self-dealing: the venue does not earn a share on its own payments.
    if (payment.organization_id && venue.venue_org_id === payment.organization_id) return null;

    // Venue earns a fixed fraction (default 20%) of the platform fee on the
    // transaction. Scales at every booking size; never exceeds the fee.
    const shareCents = Math.round(feeCents * rate);
    if (shareCents <= 0) return null;

    const inserted = await q1<{ id: string }>(
      `insert into venue_revenue_share
         (source_payment_id, event_id, venue_id, venue_org_id, base_cents,
          share_rate, share_cents, platform_fee_cents, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,'accrued')
       on conflict (source_payment_id) do nothing
       returning id`,
      [payment.id, payment.event_id ?? null, venue.venue_id, venue.venue_org_id, baseCents, rate, shareCents, feeCents],
    );
    if (!inserted?.id) return null; // already accrued for this payment

    // Backfill the venue carve-out onto the platform_revenue row for one view.
    await q1(
      `update platform_revenue
          set venue_org_id = $2, venue_share_cents = $3, venue_share_rate = $4, updated_at = now()
        where id = $1`,
      [revenueId, venue.venue_org_id, shareCents, rate],
    ).catch(() => null);

    return { venueOrgId: venue.venue_org_id, shareCents };
  } catch {
    return null;
  }
}

export interface PlatformFeeRecord {
  /** The inserted platform_revenue row, or null when a row already existed. */
  created: boolean;
  revenueId: string | null;
  feeCents: number;
  /** The accrued referral commission, when a referring partner was found. */
  referral: RecordedCommission | null;
  /** The hosting venue's revenue share carved from the platform fee, when any. */
  venueShare: { venueOrgId: string; shareCents: number } | null;
}

/**
 * Resolve the platform fee + processing cost (in cents) for a payment row.
 * Prefers the values already recorded on the row; falls back to computeFees with
 * the org tier, and finally to the env-default percentage of the amount.
 */
function resolveFeeCents(
  payment: Pick<PaymentRow, "amount" | "platform_fee" | "processing_fee">,
  tier: string | null,
): { baseCents: number; feeCents: number; processingCents: number; feeRate: number } {
  const baseCents = toCents(payment.amount);
  let feeCents = toCents(payment.platform_fee);
  let processingCents = toCents(payment.processing_fee);

  if (feeCents <= 0 || processingCents <= 0) {
    // Recompute from the tier when the row did not carry a fee/processing cost.
    const computed = computeFees(Number(payment.amount) || 0, tier);
    if (feeCents <= 0) feeCents = toCents(computed.platformFee);
    if (processingCents <= 0) processingCents = toCents(computed.processingFee);
  }

  // Last-resort fallback so a recorded payment never accrues a zero platform fee
  // purely because both the row and the tier were silent.
  if (feeCents <= 0 && baseCents > 0) {
    feeCents = Math.round(baseCents * platformFeeDefaultRate());
  }

  const feeRate = baseCents > 0 ? feeCents / baseCents : 0;
  return { baseCents, feeCents, processingCents, feeRate };
}

/**
 * RECORD the platform fee for one on-platform payment into the platform_revenue
 * accrual ledger (idempotent per payment id), and accrue any agreed referral
 * commission for the org that was referred. Safe to call from inside or outside
 * a transaction. NEVER throws back into the payment path: a monetization failure
 * must not roll back a successfully recorded payment, so all errors are
 * swallowed and surfaced only as created:false. The accrual ledger is, by
 * design, reconcilable after the fact.
 *
 * External (off-platform) payments are skipped here: their fee-owed obligation
 * is already tracked on the payment row (fee_owed) and the leakage_events table.
 */
export async function recordPlatformFee(
  payment: PaymentRow,
  tier: string | null,
  recordedBy: string | null,
): Promise<PlatformFeeRecord> {
  const empty: PlatformFeeRecord = { created: false, revenueId: null, feeCents: 0, referral: null, venueShare: null };
  try {
    if (!payment?.id) return empty;
    if (payment.external_payment_flag) return empty; // off-platform: tracked via fee_owed
    if (!(await tableExists("platform_revenue"))) return empty;

    const orgId = payment.organization_id ?? null;
    const { baseCents, feeCents, processingCents, feeRate } = resolveFeeCents(payment, tier);

    const feeBasis = `${tier ?? "default"} ${(feeRate * 100).toFixed(2)}% on ${(baseCents / 100).toFixed(2)}`;

    // Idempotent accrual: a second attempt for the same payment is a no-op.
    const inserted = await q1<{ id: string }>(
      `insert into platform_revenue
         (source, source_payment_id, organization_id, base_cents, fee_cents, fee_basis,
          fee_rate, processing_cost_cents, status)
       values ('payment',$1,$2,$3,$4,$5,$6,$7,'accrued')
       on conflict (source_payment_id) do nothing
       returning id`,
      [payment.id, orgId, baseCents, feeCents, feeBasis, feeRate, processingCents],
    );

    if (!inserted?.id) {
      // Already accrued for this payment (idempotent no-op). Do not re-accrue the
      // referral commission or the venue share either.
      return { created: false, revenueId: null, feeCents, referral: null, venueShare: null };
    }

    // First time we have seen this payment: accrue any referral commission, then
    // backfill the referral columns on the revenue row for the audit trail.
    const referral = orgId
      ? await maybeRecordReferralCommission(orgId, payment, tier, recordedBy)
      : null;

    if (referral && referral.row) {
      await q1(
        `update platform_revenue
            set referral_partner_id = $2,
                referral_commission_id = $3,
                referral_split_cents = $4,
                updated_at = now()
          where id = $1`,
        [inserted.id, referral.row.partner_id, referral.row.id, referral.commissionCents],
      ).catch(() => null);
    }

    // Accrue the hosting venue's 1% revenue share, carved out of the platform
    // fee (capped at it), skipping self-dealing. Idempotent + best-effort.
    const venueShare = await maybeRecordVenueShare(inserted.id, payment, baseCents, feeCents);

    return { created: true, revenueId: inserted.id, feeCents, referral, venueShare };
  } catch {
    return empty;
  }
}

/**
 * If the paying org was referred by a partner, accrue that partner's
 * profit-based split into partner_commissions via the existing recordCommission
 * engine, with status 'accrued'. Returns null when there is no referring partner
 * (or the tables are absent). Reads the agreed revenue share off the partner row
 * inside recordCommission, so this honours the partner's configured percentage,
 * applies-to toggles, and subscription mode. Never throws.
 *
 * The commission base mirrors what the platform actually earned on this payment:
 *   platformFeeCents  - the platform fee accrued on the transaction
 *   processingCostCents - the processing cost we estimate we paid
 * so net_profit = platformFee - processingCost (the canonical profit model).
 */
export async function maybeRecordReferralCommission(
  orgId: string,
  payment: Pick<PaymentRow, "id" | "amount" | "platform_fee" | "processing_fee" | "flow" | "kind">,
  tier: string | null,
  _recordedBy: string | null,
): Promise<RecordedCommission | null> {
  try {
    const partner = await partnerForReferredOrg(orgId);
    if (!partner) return null;

    const { baseCents, feeCents, processingCents } = resolveFeeCents(payment, tier);

    const source: CommissionSource = "transaction";
    const recorded = await recordCommission({
      partnerId: partner.partner_id,
      referredOrgId: orgId,
      source,
      grossCents: baseCents,
      platformFeeCents: feeCents,
      processingCostCents: processingCents,
      status: "accrued",
      note: `Auto-accrued from payment ${payment.id}`,
    });
    return recorded;
  } catch {
    return null;
  }
}
