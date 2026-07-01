/**
 * Module 1 - PROFIT-BASED partner commission engine.
 *
 * A partner earns a share of Divini's PROFIT on a referred transaction, never a
 * share of the gross invoice. Profit on a transaction is the platform fee we
 * collected minus the payment-processing cost we paid:
 *
 *     net_profit = platformFeeCents - processingCostCents
 *
 * The partner's configured share percentage is then applied to that profit.
 *
 * Worked example (the canonical case):
 *   A referred org books a $100,000 event.
 *     grossCents          = 10_000_000  ($100,000 invoice)
 *     platformFeeCents    =    250_000  ($2,500 platform fee we collected)
 *     processingCostCents =     60_000  ($600 we paid the processor)
 *   net_profit            =    190_000  ($1,900 profit)
 *   partner share 50%     ->    95_000  ($950 commission)
 *
 * The engine is deterministic and pure: no DB, no clock, no eval. It honours the
 * partner's applies-to toggles (so a partner who does not earn on transaction
 * fees gets 0 for a transaction source) and the subscription mode for
 * subscription sources.
 *
 * All amounts are integer cents. share percentages are whole-number percents
 * (50 == 50%).
 */

export type CommissionSource =
  | "subscription"
  | "transaction"
  | "setup"
  | "enterprise"
  | "manual_adjustment";

/** The subset of a partner row the engine needs. Matches db/schema-rev-partner.sql. */
export interface PartnerCommissionConfig {
  commission_type?: string | null;
  revenue_share_pct?: number | string | null;
  flat_fee_cents?: number | string | null;
  applies_subscriptions?: boolean | null;
  applies_transaction_fees?: boolean | null;
  applies_setup_fees?: boolean | null;
  applies_enterprise?: boolean | null;
  subscription_mode?: string | null;
  subscription_months?: number | string | null;
  subscription_share_pct?: number | string | null;
}

export interface CommissionInput {
  source: CommissionSource;
  /** Original invoice amount in cents (reference only, not the commission base). */
  grossCents: number;
  /** Platform fee we collected on this transaction, in cents. */
  platformFeeCents: number;
  /** Processing cost we paid on this transaction, in cents. */
  processingCostCents: number;
  /**
   * For subscription sources only: which billing cycle this is (1-based). Used
   * by the first_x_months subscription mode to decide eligibility. Optional;
   * defaults to 1 so a single charge is always inside any positive window.
   */
  subscriptionCycle?: number;
}

export interface CommissionResult {
  /** platformFeeCents - processingCostCents, floored at 0. */
  netProfitCents: number;
  /** The share percentage actually applied (whole-number percent). */
  sharePct: number;
  /** The commission owed to the partner, in cents (>= 0). */
  commissionCents: number;
}

function num(v: number | string | null | undefined, fallback = 0): number {
  if (v == null) return fallback;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Decide whether the partner's toggles allow earning on this source at all.
 * Returns false (commission must be 0) when the relevant applies-to flag is off,
 * or when the subscription mode excludes this cycle.
 */
function sourceEligible(partner: PartnerCommissionConfig, input: CommissionInput): boolean {
  switch (input.source) {
    case "transaction":
      return partner.applies_transaction_fees !== false;
    case "setup":
      return partner.applies_setup_fees === true;
    case "enterprise":
      return partner.applies_enterprise === true;
    case "manual_adjustment":
      return true;
    case "subscription": {
      if (partner.applies_subscriptions === false) return false;
      const mode = partner.subscription_mode ?? "include";
      const cycle = num(input.subscriptionCycle, 1);
      switch (mode) {
        case "exclude":
          return false;
        case "first_x_months": {
          const months = num(partner.subscription_months, 0);
          // Eligible only while inside the first X billing cycles.
          return months > 0 && cycle <= months;
        }
        case "include":
        case "lifetime":
        case "custom":
        default:
          return true;
      }
    }
    default:
      return false;
  }
}

/**
 * Compute the profit-based commission for one referred transaction.
 *
 * net_profit = max(0, platformFeeCents - processingCostCents). The share is the
 * subscription_share_pct for an eligible subscription that defines one, else the
 * partner's revenue_share_pct. commission = round(net_profit * share/100) for
 * percentage / share / transaction_share types; flat -> flat_fee_cents; hybrid
 * -> flat_fee_cents + percentage-of-profit.
 */
export function computePartnerCommission(
  partner: PartnerCommissionConfig,
  input: CommissionInput,
): CommissionResult {
  const platformFee = Math.max(0, Math.round(num(input.platformFeeCents)));
  const processingCost = Math.max(0, Math.round(num(input.processingCostCents)));
  const netProfitCents = Math.max(0, platformFee - processingCost);

  if (!sourceEligible(partner, input)) {
    return { netProfitCents, sharePct: 0, commissionCents: 0 };
  }

  const baseSharePct = num(partner.revenue_share_pct, 0);
  const subShare = partner.subscription_share_pct;
  const sharePct =
    input.source === "subscription" && subShare != null && subShare !== ""
      ? num(subShare, baseSharePct)
      : baseSharePct;

  const flat = Math.max(0, Math.round(num(partner.flat_fee_cents, 0)));
  const type = partner.commission_type ?? "percentage";

  let commissionCents: number;
  switch (type) {
    case "flat":
      commissionCents = flat;
      break;
    case "hybrid":
      // Flat retainer plus a percentage of the profit.
      commissionCents = flat + Math.round((netProfitCents * sharePct) / 100);
      break;
    case "percentage":
    case "subscription_share":
    case "transaction_share":
    default:
      commissionCents = Math.round((netProfitCents * sharePct) / 100);
      break;
  }

  return {
    netProfitCents,
    sharePct,
    commissionCents: Math.max(0, commissionCents),
  };
}
