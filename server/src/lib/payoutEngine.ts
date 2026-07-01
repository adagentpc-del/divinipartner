/**
 * payoutEngine - computes a partner's payout for a period from the
 * cross-workstream `partner_commissions` rows (read by name, graceful when
 * absent), applying the partner's revenue_share_pct, manual adjustments, and
 * exclusion controls.
 *
 * Profit basis: net_profit = platform_fees - processing_costs - refunds -
 * chargebacks. commission_owed = net_profit * commission_pct + manual_adjustment
 * (minus excluded rows, which are already filtered out of the aggregate).
 *
 * This NEVER moves money. It records and tracks. A real ACH provider is required
 * for actual disbursement; marking a payout 'paid' is a manual super-admin
 * action that records the event for reconciliation.
 *
 * ZERO em dashes in this file (hard rule).
 */
import * as db from "../db/payouts.js";

export interface ComputeOptions {
  /** Override the commission pct (0..1). Defaults to the partner record. */
  commissionPctOverride?: number | null;
  /** Manual adjustment in cents (can be negative). Defaults 0. */
  manualAdjustmentCents?: number;
  /** Optional explicit profit-basis figures (cents) when not derivable. */
  basis?: Partial<{
    gross_volume_cents: number;
    platform_fees_cents: number;
    processing_costs_cents: number;
    refunds_cents: number;
    chargebacks_cents: number;
  }>;
}

export interface ComputeResult {
  partner_id: string;
  period: string;
  net_profit_cents: number;
  commission_pct: number;
  commission_owed_cents: number;
  manual_adjustment_cents: number;
  source_rows: number;
  partnerPresent: boolean;
  commissionsPresent: boolean;
}

function clampPct(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v > 1 ? 1 : v;
}

/**
 * Compute (and persist) the payout for one partner + period. Reads the partner's
 * revenue_share_pct and the aggregated commission rows; if neither table exists
 * the computation falls back to the explicit basis (or zeros) so the engine
 * never throws on a fresh database.
 */
export async function computePayout(
  partnerId: string,
  period: string,
  opts: ComputeOptions = {},
): Promise<ComputeResult & { saved: db.PayoutRow }> {
  const partner = await db.getPartner(partnerId);
  const agg = await db.aggregateCommissions(partnerId);

  // Profit basis. Prefer the aggregated net_profit from commission rows; fall
  // back to an explicit basis computed from the standard profit formula.
  const basis = opts.basis ?? {};
  const derivedNet =
    (basis.platform_fees_cents ?? 0) -
    (basis.processing_costs_cents ?? 0) -
    (basis.refunds_cents ?? 0) -
    (basis.chargebacks_cents ?? 0);
  const netProfit = agg.rows > 0 ? agg.net_profit_cents : derivedNet;

  const pct =
    opts.commissionPctOverride != null
      ? clampPct(opts.commissionPctOverride)
      : clampPct(partner?.revenue_share_pct);

  const manual = Math.trunc(opts.manualAdjustmentCents ?? 0);

  // commission_owed = net_profit * pct + manual_adjustment. When the commission
  // rows already carry a per-row commission_cents sum, prefer that as the
  // computed commission and add the manual adjustment on top.
  const baseCommission =
    agg.rows > 0 && agg.commission_cents > 0
      ? agg.commission_cents
      : Math.round(netProfit * pct);
  const owed = baseCommission + manual;

  const saved = await db.upsertPayout({
    partner_id: partnerId,
    period,
    gross_volume_cents: basis.gross_volume_cents ?? 0,
    platform_fees_cents: basis.platform_fees_cents ?? 0,
    processing_costs_cents: basis.processing_costs_cents ?? 0,
    refunds_cents: basis.refunds_cents ?? 0,
    chargebacks_cents: basis.chargebacks_cents ?? 0,
    net_profit_cents: netProfit,
    commission_pct: pct,
    commission_owed_cents: owed,
  });

  // If a manual adjustment was supplied, persist it onto the row too.
  if (manual !== 0) {
    await db.patchPayout(saved.id, { manual_adjustment_cents: manual });
  }

  return {
    partner_id: partnerId,
    period,
    net_profit_cents: netProfit,
    commission_pct: pct,
    commission_owed_cents: owed,
    manual_adjustment_cents: manual,
    source_rows: agg.rows,
    partnerPresent: !!partner,
    commissionsPresent: agg.rows > 0,
    saved,
  };
}

/** Build a CSV-able JSON export of the payout ledger (optionally one partner). */
export async function exportPayouts(partnerId?: string): Promise<{
  columns: string[];
  rows: (string | number)[][];
}> {
  const list = await db.listPayouts(partnerId);
  const columns = [
    "partner_id",
    "period",
    "gross_volume_cents",
    "platform_fees_cents",
    "processing_costs_cents",
    "refunds_cents",
    "chargebacks_cents",
    "net_profit_cents",
    "commission_pct",
    "commission_owed_cents",
    "commission_paid_cents",
    "manual_adjustment_cents",
    "status",
    "requires_approval",
    "paused",
    "created_at",
  ];
  const rows = list.map((p) => [
    p.partner_id ?? "",
    p.period ?? "",
    Number(p.gross_volume_cents),
    Number(p.platform_fees_cents),
    Number(p.processing_costs_cents),
    Number(p.refunds_cents),
    Number(p.chargebacks_cents),
    Number(p.net_profit_cents),
    Number(p.commission_pct),
    Number(p.commission_owed_cents),
    Number(p.commission_paid_cents),
    Number(p.manual_adjustment_cents),
    p.status,
    p.requires_approval ? "true" : "false",
    p.paused ? "true" : "false",
    p.created_at,
  ]);
  return { columns, rows };
}
