/**
 * Payments data-access + flows (blueprint section 21).
 *
 * Payment FLOWS (all routed conceptually through Divini, record/track only):
 *   - client_to_vendor        : client pays vendor via Divini (fee deducted, payout)
 *   - client_to_venue         : client pays venue via Divini (fee deducted, payout)
 *   - client_to_divini_payout : client pays Divini, Divini routes a payout
 *   - deposit + balance + milestone are KINDS of the above flows
 *   - external_recorded       : recorded but flagged off-platform (leakage policy)
 *
 * NO real payment processor is integrated. We record amounts, compute the fee
 * breakdown, track payout status, and (for external) carry an external_payment_flag.
 */
import { q, q1 } from "../pool.js";
import { TIERS } from "../db.js";
import { PRICING_V2, PLATFORM_FEE_RATE_V2 } from "../config.js";
import {
  computeOnTopCharge as computeOnTopChargePure,
  decomposeGrossOnTop as decomposeGrossOnTopPure,
} from "../lib/pricingMath.js";

export const PAYOUT_STATUSES = [
  "not_ready",
  "awaiting_payment",
  "payment_received",
  "fee_deducted",
  "payout_pending",
  "payout_sent",
  "payout_failed",
  "refunded",
  "disputed",
] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  not_ready: "Not ready",
  awaiting_payment: "Awaiting payment",
  payment_received: "Payment received",
  fee_deducted: "Platform fee deducted",
  payout_pending: "Payout pending",
  payout_sent: "Payout sent",
  payout_failed: "Payout failed",
  refunded: "Refunded",
  disputed: "Disputed",
};

export const PAYMENT_FLOWS = [
  "client_to_vendor",
  "client_to_venue",
  "client_to_divini_payout",
  "external_recorded",
] as const;
export type PaymentFlow = (typeof PAYMENT_FLOWS)[number];

export const PAYMENT_KINDS = ["deposit", "balance", "milestone", "full"] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

/**
 * Configurable fees list (blueprint 21.3). The platform_fee rate is overridden
 * per-org by db.TIERS at compute time; these are the defaults/labels.
 */
export const CONFIGURABLE_FEES = [
  { key: "platform_fee", label: "Platform Fee", type: "percent" as const, value: 0.025, applies_to: "invoice" },
  { key: "processing_fee", label: "Payment Processing Fee", type: "percent" as const, value: 0.029, applies_to: "payment" },
  { key: "processing_fee_flat", label: "Processing Fee (flat)", type: "flat" as const, value: 0.3, applies_to: "payment" },
  { key: "rush_fee", label: "Rush Handling Fee", type: "flat" as const, value: 75, applies_to: "invoice" },
];

export interface PaymentRow {
  id: string;
  invoice_id: string | null;
  event_id: string | null;
  organization_id: string | null;
  amount: string | null;
  method: string | null;
  flow: string | null;
  kind: string | null;
  status: string | null;
  platform_fee: string | null;
  processing_fee: string | null;
  net_payout: string | null;
  payout_status: string | null;
  payee_org_id: string | null;
  payee_label: string | null;
  fee_breakdown: Record<string, unknown> | null;
  external_payment_flag: boolean;
  external_reason: string | null;
  external_proof: string | null;
  fee_owed: string | null;
  reference: string | null;
  recorded_by: string | null;
  created_at: string;
}

function feeRateForTier(tier: string | null | undefined): number {
  // Pricing V2: a single flat platform fee, no tiers.
  if (PRICING_V2) return PLATFORM_FEE_RATE_V2;
  if (tier && (TIERS as Record<string, { feeRate: number }>)[tier]) {
    return (TIERS as Record<string, { feeRate: number }>)[tier].feeRate;
  }
  return TIERS.free_partner.feeRate;
}

/**
 * Pricing V2 on-top charge model. Given a vendor SUBTOTAL (what the vendor
 * should receive), returns the platform fee ADDED ON TOP, the client total, the
 * vendor payout (the full subtotal), and the venue share (20% of the fee). All
 * values in major currency units (dollars), rounded to cents. Pure + additive;
 * callers adopt this in the quote/checkout flow (Wave 2). The client is the only
 * party whose total changes; the vendor is always made whole.
 */
export function computeOnTopCharge(subtotal: number): {
  subtotal: number;
  platformFee: number;
  clientTotal: number;
  vendorPayout: number;
  venueShare: number;
  feeRate: number;
} {
  // Delegate to the pure, dependency-free money math; pass the V2 fee rate.
  return computeOnTopChargePure(subtotal, PLATFORM_FEE_RATE_V2, 0.2);
}

/** Compute the platform + processing fees and the net payout for a payment. */
export function computeFees(amount: number, tier: string | null | undefined): {
  platformFee: number;
  processingFee: number;
  netPayout: number;
  breakdown: Record<string, number>;
} {
  const amt = Number(amount) || 0;
  const rate = feeRateForTier(tier);
  const platformFee = Math.round(amt * rate * 100) / 100;
  const pctFee = CONFIGURABLE_FEES.find((f) => f.key === "processing_fee");
  const flatFee = CONFIGURABLE_FEES.find((f) => f.key === "processing_fee_flat");
  const processingFee =
    Math.round((amt * (pctFee?.value ?? 0) + (flatFee?.value ?? 0)) * 100) / 100;
  const netPayout = Math.round((amt - platformFee - processingFee) * 100) / 100;
  return {
    platformFee,
    processingFee,
    netPayout,
    breakdown: { platform_fee: platformFee, processing_fee: processingFee, net_payout: netPayout, platform_fee_rate: rate },
  };
}

/**
 * Pricing V2 payment-recording model (Wave 2 decision).
 *
 * UNDER PRICING_V2 the amount that arrives at payment-recording time is the
 * GROSS CLIENT TOTAL (vendor subtotal + 5% platform fee added on top). This is
 * what the client was actually charged at checkout (the invoice/quote total IS
 * the client total under V2) and what the processor reports back on capture.
 * We therefore do NOT add the fee again here: we DECOMPOSE the gross back into
 * its subtotal and fee, so:
 *     subtotal     = gross / (1 + rate)        (the vendor's quoted price)
 *     platform_fee = gross - subtotal          (the 5% added on top)
 *     net_payout   = subtotal                  (the vendor is made whole)
 *     amount       = gross                      (what the client paid)
 * No processing fee is carved out of the vendor under V2 (the vendor receives
 * their full quote); processing_fee stays 0.
 *
 * This keeps recording idempotent and consistent whether the caller is the
 * synchronous capture path, a webhook backstop, or a manual record: every one
 * of them passes the gross the client paid, and decomposition is a pure
 * function of that gross, so re-recording the same gross yields the same row.
 *
 * When PRICING_V2 is OFF this is never called and computeFees (the legacy
 * carve-out) governs, so behavior is byte-for-byte identical to today.
 */
export function decomposeGrossOnTop(gross: number): {
  platformFee: number;
  processingFee: number;
  netPayout: number;
  breakdown: Record<string, number>;
} {
  const rate = PLATFORM_FEE_RATE_V2;
  // Delegate the pure decomposition; keep the breakdown/return shape identical.
  const { subtotal, platformFee, netPayout } = decomposeGrossOnTopPure(gross, rate);
  const total = Math.max(0, Math.round((Number(gross) || 0) * 100) / 100);
  return {
    platformFee,
    processingFee: 0,
    netPayout,
    breakdown: {
      platform_fee: platformFee,
      processing_fee: 0,
      net_payout: netPayout,
      subtotal,
      client_total: total,
      platform_fee_rate: rate,
      on_top: 1,
    },
  };
}

/**
 * Resolve the fee breakdown for a recorded payment. Under PRICING_V2 the input
 * amount is the gross client total and we decompose it on-top; otherwise we use
 * the legacy tier carve-out. Single chokepoint so every insert path agrees.
 */
function resolvePaymentFees(
  amount: number,
  tier: string | null | undefined,
): { platformFee: number; processingFee: number; netPayout: number; breakdown: Record<string, number> } {
  return PRICING_V2 ? decomposeGrossOnTop(amount) : computeFees(amount, tier);
}

export interface RecordPaymentInput {
  invoice_id?: string | null;
  event_id?: string | null;
  amount: number;
  method?: string | null;
  flow: PaymentFlow;
  kind?: PaymentKind;
  payee_org_id?: string | null;
  payee_label?: string | null;
  reference?: string | null;
  payout_status?: PayoutStatus;
}

/**
 * Money-loop hook. After an on-platform payment row is recorded, accrue the
 * platform fee into the platform_revenue ledger and any agreed referral split
 * into partner_commissions. Idempotent per payment id (see lib/monetization.ts),
 * so capture + webhook never double-accrue. Lazily imported to keep the module
 * graph acyclic (monetization.ts imports computeFees/PaymentRow from here).
 * NEVER throws back into the payment path: a monetization failure must not roll
 * back a successfully recorded payment.
 */
async function accruePlatformRevenue(
  payment: PaymentRow | null,
  tier: string | null,
  recordedBy: string | null,
): Promise<void> {
  if (!payment) return;
  try {
    const { recordPlatformFee } = await import("../lib/monetization.js");
    await recordPlatformFee(payment, tier, recordedBy);
  } catch {
    // Swallow: the accrual ledger is reconcilable after the fact and must never
    // break payment recording.
  }
}

/** Record an on-platform payment (deposit/balance/milestone/full). */
export async function recordPayment(
  orgId: string,
  tier: string | null,
  recordedBy: string | null,
  input: RecordPaymentInput,
): Promise<PaymentRow> {
  const { platformFee, processingFee, netPayout, breakdown } = resolvePaymentFees(input.amount, tier);
  const payout: PayoutStatus = input.payout_status ?? "payment_received";
  const row = (await q1<PaymentRow>(
    `insert into payments
       (invoice_id, event_id, organization_id, amount, method, flow, kind, status,
        platform_fee, processing_fee, net_payout, payout_status, payee_org_id, payee_label,
        fee_breakdown, external_payment_flag, reference, recorded_by)
     values ($1,$2,$3,$4,$5,$6,$7,'recorded',$8,$9,$10,$11,$12,$13,$14::jsonb,false,$15,$16)
     returning *`,
    [
      input.invoice_id ?? null,
      input.event_id ?? null,
      orgId,
      Number(input.amount) || 0,
      input.method ?? "platform",
      input.flow,
      input.kind ?? "full",
      platformFee,
      processingFee,
      netPayout,
      payout,
      input.payee_org_id ?? null,
      input.payee_label ?? null,
      JSON.stringify(breakdown),
      input.reference ?? null,
      recordedBy,
    ],
  )) as PaymentRow;
  // Close the money loop: accrue platform fee + referral commission.
  await accruePlatformRevenue(row, tier, recordedBy);
  return row;
}

export interface ExternalPaymentRecordInput {
  invoice_id?: string | null;
  event_id?: string | null;
  amount: number;
  method?: string | null;
  reason: string;
  proof: string;
  fee_owed: number;
  acknowledged_by?: string | null;
  reference?: string | null;
}

/**
 * Record a payment that happened OFF-platform but is being tracked. Flagged via
 * external_payment_flag with the reason + proof + fee still owed. Payout status is
 * "not_ready" because nothing flows through Divini.
 */
export async function recordExternalPayment(
  orgId: string,
  recordedBy: string | null,
  input: ExternalPaymentRecordInput,
): Promise<PaymentRow> {
  return (await q1<PaymentRow>(
    `insert into payments
       (invoice_id, event_id, organization_id, amount, method, flow, kind, status,
        platform_fee, processing_fee, net_payout, payout_status, fee_breakdown,
        external_payment_flag, external_reason, external_proof, external_acknowledged_by,
        fee_owed, reference, recorded_by)
     values ($1,$2,$3,$4,$5,'external_recorded','full','external',0,0,0,'not_ready',
        $6::jsonb,true,$7,$8,$9,$10,$11,$12)
     returning *`,
    [
      input.invoice_id ?? null,
      input.event_id ?? null,
      orgId,
      Number(input.amount) || 0,
      input.method ?? "external",
      JSON.stringify({ external: true, fee_owed: input.fee_owed }),
      input.reason,
      input.proof,
      input.acknowledged_by ?? null,
      Number(input.fee_owed) || 0,
      input.reference ?? null,
      recordedBy,
    ],
  )) as PaymentRow;
}

/** Look up a payment by its processor reference (Stripe payment_intent / PayPal
 *  capture id). Used to keep capture + webhook idempotent. */
export async function findPaymentByReference(reference: string): Promise<PaymentRow | null> {
  if (!reference) return null;
  return q1<PaymentRow>(`select * from payments where reference = $1 order by created_at desc limit 1`, [reference]);
}

export interface ProcessorPaymentInput extends RecordPaymentInput {
  reference: string; // processor reference, required for dedupe
}

/**
 * Internal insert variant used ONLY by recordProcessorPayment. Identical to
 * recordPayment but with `on conflict (reference) do nothing`, so a concurrent
 * insert with the same reference cannot create a second row. Returns the
 * inserted row, or null when the conflict suppressed the insert.
 */
async function insertProcessorPaymentOnConflict(
  orgId: string,
  tier: string | null,
  recordedBy: string | null,
  input: ProcessorPaymentInput,
): Promise<PaymentRow | null> {
  const { platformFee, processingFee, netPayout, breakdown } = resolvePaymentFees(input.amount, tier);
  const payout: PayoutStatus = input.payout_status ?? "payment_received";
  return q1<PaymentRow>(
    `insert into payments
       (invoice_id, event_id, organization_id, amount, method, flow, kind, status,
        platform_fee, processing_fee, net_payout, payout_status, payee_org_id, payee_label,
        fee_breakdown, external_payment_flag, reference, recorded_by)
     values ($1,$2,$3,$4,$5,$6,$7,'recorded',$8,$9,$10,$11,$12,$13,$14::jsonb,false,$15,$16)
     on conflict (reference) do nothing
     returning *`,
    [
      input.invoice_id ?? null,
      input.event_id ?? null,
      orgId,
      Number(input.amount) || 0,
      input.method ?? "platform",
      input.flow,
      input.kind ?? "full",
      platformFee,
      processingFee,
      netPayout,
      payout,
      input.payee_org_id ?? null,
      input.payee_label ?? null,
      JSON.stringify(breakdown),
      input.reference ?? null,
      recordedBy,
    ],
  );
}

/**
 * Idempotently record a real (captured) processor payment. If a payment already
 * exists for this reference it is returned untouched (created:false), so the
 * synchronous capture endpoint and the webhook backstop never double-record.
 *
 * C5: the insert is atomic via `on conflict (reference) do nothing`. Under a
 * race, exactly one caller's insert wins (created:true); the loser sees no
 * returned row, re-selects by reference, and returns created:false. This holds
 * even when the find-by-reference fast path missed because both calls raced.
 */
export async function recordProcessorPayment(
  orgId: string,
  tier: string | null,
  recordedBy: string | null,
  input: ProcessorPaymentInput,
): Promise<{ payment: PaymentRow; created: boolean }> {
  // Fast path: already recorded.
  const existing = await findPaymentByReference(input.reference);
  if (existing) return { payment: existing, created: false };
  // Atomic insert: only one row per reference can ever be created.
  const inserted = await insertProcessorPaymentOnConflict(orgId, tier, recordedBy, {
    ...input,
    payout_status: input.payout_status ?? "payment_received",
  });
  if (inserted) {
    // Close the money loop on first record only (idempotent regardless).
    await accruePlatformRevenue(inserted, tier, recordedBy);
    return { payment: inserted, created: true };
  }
  // Conflict: another caller won the race. Re-select and report not-created.
  const winner = await findPaymentByReference(input.reference);
  if (winner) return { payment: winner, created: false };
  // Extremely unlikely (row vanished between conflict and re-select): surface it.
  throw new Error("recordProcessorPayment: insert conflicted but no row found");
}

export async function listPayments(
  orgId: string,
  filters?: { invoice_id?: string; event_id?: string; external?: boolean },
): Promise<PaymentRow[]> {
  const where: string[] = [`organization_id = $1`];
  const params: unknown[] = [orgId];
  if (filters?.invoice_id) {
    params.push(filters.invoice_id);
    where.push(`invoice_id = $${params.length}`);
  }
  if (filters?.event_id) {
    params.push(filters.event_id);
    where.push(`event_id = $${params.length}`);
  }
  if (typeof filters?.external === "boolean") {
    params.push(filters.external);
    where.push(`external_payment_flag = $${params.length}`);
  }
  return q<PaymentRow>(`select * from payments where ${where.join(" and ")} order by created_at desc`, params);
}

const ALLOWED_PAYOUT: ReadonlySet<PayoutStatus> = new Set(PAYOUT_STATUSES);

export async function updatePayoutStatus(orgId: string, id: string, status: PayoutStatus): Promise<PaymentRow | null> {
  if (!ALLOWED_PAYOUT.has(status)) throw new Error(`invalid payout status: ${status}`);
  return q1<PaymentRow>(
    `update payments set payout_status = $3, updated_at = now()
       where id = $1 and organization_id = $2 returning *`,
    [id, orgId, status],
  );
}

/** Roll-up of platform fees + payouts for a dashboard. */
export async function paymentSummary(orgId: string): Promise<{
  total_collected: number;
  total_platform_fees: number;
  total_processing_fees: number;
  total_net_payout: number;
  total_fee_owed_external: number;
  external_count: number;
}> {
  // L1: total_collected reflects money actually collected ON-platform. Exclude
  // external_payment_flag rows (those were paid off-platform, nothing was
  // collected here) and rows whose payout_status is refunded/disputed (the
  // money was reversed). Fee/payout sums stay over all rows so the fee-owed and
  // accrual figures are not understated.
  const row = await q1<Record<string, string>>(
    `select
        coalesce(sum(case when external_payment_flag then 0
                          when payout_status in ('refunded','disputed') then 0
                          else amount end),0) as total_collected,
        coalesce(sum(platform_fee),0) as total_platform_fees,
        coalesce(sum(processing_fee),0) as total_processing_fees,
        coalesce(sum(net_payout),0) as total_net_payout,
        coalesce(sum(fee_owed),0) as total_fee_owed_external,
        coalesce(sum(case when external_payment_flag then 1 else 0 end),0) as external_count
       from payments where organization_id = $1`,
    [orgId],
  );
  return {
    total_collected: Number(row?.total_collected ?? 0),
    total_platform_fees: Number(row?.total_platform_fees ?? 0),
    total_processing_fees: Number(row?.total_processing_fees ?? 0),
    total_net_payout: Number(row?.total_net_payout ?? 0),
    total_fee_owed_external: Number(row?.total_fee_owed_external ?? 0),
    external_count: Number(row?.external_count ?? 0),
  };
}

export const __test = { computeFees, feeRateForTier, decomposeGrossOnTop, resolvePaymentFees };
