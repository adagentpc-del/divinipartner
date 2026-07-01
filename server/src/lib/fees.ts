/**
 * Fee Transparency (Module 3) - the "show the full breakdown BEFORE the
 * transaction completes" helper. Pure and dependency-free so it can run in a
 * route, a worker, a PDF, or a test.
 *
 * It layers a Stripe-style PROCESSING-FEE ESTIMATE on top of the deterministic
 * platform fee engine (server/src/lib/platformFees.ts, the single source of
 * truth for the platform fee + cap). The processing fee is ALWAYS an estimate:
 * the real number is set by the payment processor at capture time. Every shape
 * that carries the processing fee labels it as an estimate.
 *
 * All amounts are integer cents.
 *
 * Zero em dashes.
 */
import {
  computePlatformFee,
  planForOrg,
  type PlanKey,
  type PlatformFeeResult,
} from "./platformFees.js";

/** Stripe-style card processing rate (2.9%) used for the ESTIMATE. */
export const PROCESSING_RATE = 0.029;
/** Stripe-style per-transaction flat component, in cents (30c). */
export const PROCESSING_FLAT_CENTS = 30;

/** Coerce to a non-negative integer cent amount. */
function cents(amountCents: number): number {
  return Number.isFinite(amountCents) && amountCents > 0 ? Math.round(amountCents) : 0;
}

/**
 * Estimate the payment-processing fee for an amount (in cents) using the
 * Stripe-style 2.9% + 30c model. This is an ESTIMATE only; the processor sets
 * the real fee at capture time. Returns 0 for a non-positive amount.
 */
export function estimateProcessingFee(amountCents: number): number {
  const amount = cents(amountCents);
  if (amount <= 0) return 0;
  return Math.round(amount * PROCESSING_RATE) + PROCESSING_FLAT_CENTS;
}

/** The org shape the breakdown needs (tier + optional enterprise rate). */
export type FeeOrg = { tier?: string | null; platform_fee_rate?: number | null };

/**
 * The full fee-transparency breakdown for a transaction. This is the data the
 * UI shows before a transaction completes:
 *
 *   payout = amount - platformFee - processingFee(estimate)
 *
 * `processingFeeCents` (and therefore `totalDeductedCents` / `payoutCents`) is
 * an ESTIMATE because it includes the estimated processing fee.
 */
export interface FeeBreakdown {
  amountCents: number;
  plan: PlanKey;
  /** Effective platform fee fraction applied (0.025 == 2.5%). */
  feeRate: number;
  /** Effective cap in cents, or null for no cap. */
  capCents: number | null;
  /** Final platform fee after the cap. */
  platformFeeCents: number;
  /** True when the cap reduced the platform fee. */
  capApplied: boolean;
  /** Stripe-style processing fee ESTIMATE (2.9% + 30c). */
  processingFeeCents: number;
  /** Always true: the processing fee component is an estimate. */
  processingFeeIsEstimate: true;
  /** platformFee + processingFee(estimate). */
  totalDeductedCents: number;
  /** amount - totalDeducted. */
  payoutCents: number;
}

/**
 * Compose the full transparency breakdown for an amount + paying org. Reuses
 * computePlatformFee for the platform fee + cap, then adds the processing-fee
 * estimate, the total deducted, and the resulting payout. Never throws and
 * never returns a negative payout.
 */
export function buildFeeBreakdown(amountCents: number, org: FeeOrg): FeeBreakdown {
  const amount = cents(amountCents);
  const fee: PlatformFeeResult = computePlatformFee(amount, org);
  const processingFeeCents = estimateProcessingFee(amount);
  const totalDeductedCents = fee.platformFeeCents + processingFeeCents;
  const payoutCents = Math.max(0, amount - totalDeductedCents);

  return {
    amountCents: amount,
    plan: fee.plan,
    feeRate: fee.feeRate,
    capCents: fee.capCents,
    platformFeeCents: fee.platformFeeCents,
    capApplied: fee.capApplied,
    processingFeeCents,
    processingFeeIsEstimate: true,
    totalDeductedCents,
    payoutCents,
  };
}

/** Resolve a plan key directly from a tier/rate (thin re-export of planForOrg). */
export function planForTier(org: FeeOrg): PlanKey {
  return planForOrg(org);
}
