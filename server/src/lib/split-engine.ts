/**
 * Divini Partners - STRIPE CONNECT PAYOUT SPLIT ENGINE.
 *
 * Given a COLLECTED platform_revenue row (db/schema-rev-accrual.sql), determine
 * each party's agreed split and queue a payout_instructions row per split. This
 * is the Stripe Connect transfer rail's queue builder; it is conservative by
 * design: a split is produced ONLY where a real recipient AND a positive amount
 * exist. We never invent a split.
 *
 * The split source is what agent-165's monetization hook ALREADY accrued onto
 * the revenue row and the partner_commissions ledger, so this engine never
 * re-derives a percentage and cannot drift:
 *
 *   1. platform_revenue.referral_partner_id + referral_split_cents - the agreed
 *      referral-partner share that the monetization hook backfilled when the
 *      paying org was referred. This is the canonical, authoritative split.
 *   2. If, defensively, the revenue row carries a partner but a zero/absent
 *      referral_split_cents, we fall back to the accrued partner_commissions row
 *      (referral_commission_id) commission_cents for the same revenue.
 *
 * enqueueSplitsForRevenue is idempotent (skips a revenue id that already has
 * instructions) and best-effort (never throws into the caller), so wiring it
 * onto the platform_revenue status -> 'collected' transition can never break
 * that flow.
 *
 * Zero em dashes by convention. Integer cents throughout.
 */
import { q, q1 } from "../pool.js";

function num(v: number | string | null | undefined, fallback = 0): number {
  if (v == null) return fallback;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

export type RecipientKind = "partner" | "organization" | "user";

export interface ComputedSplit {
  recipient_kind: RecipientKind;
  recipient_partner_id?: string | null;
  recipient_organization_id?: string | null;
  recipient_user_id?: string | null;
  basis_cents: number;
  split_percentage: number | null;
  amount_cents: number;
}

export interface PlatformRevenueRow {
  id: string;
  organization_id: string | null;
  source_payment_id: string | null;
  base_cents: number | string | null;
  fee_cents: number | string | null;
  currency?: string | null;
  referral_partner_id: string | null;
  referral_commission_id: string | null;
  referral_split_cents: number | string | null;
}

/**
 * Compute the splits for one platform_revenue row. Returns [] when no party has
 * a positive share. The only split produced today is the referral partner who
 * was credited a share on this revenue (the monetization hook backfilled
 * referral_partner_id + referral_split_cents). The amount basis is the platform
 * fee (fee_cents); split_percentage is derived for display when both are known.
 */
export async function computeSplits(
  revenueRow: PlatformRevenueRow,
): Promise<ComputedSplit[]> {
  const splits: ComputedSplit[] = [];
  const feeCents = Math.max(0, Math.round(num(revenueRow.fee_cents)));
  const partnerId = revenueRow.referral_partner_id ?? null;
  if (!partnerId) return splits;

  // Authoritative: the split the monetization hook already accrued onto the row.
  let splitCents = Math.max(0, Math.round(num(revenueRow.referral_split_cents)));

  // Defensive fallback: if the row carries a partner but no split figure, read
  // the accrued partner_commissions row's commission_cents for this revenue.
  if (splitCents <= 0 && revenueRow.referral_commission_id) {
    const c = await q1<{ commission_cents: number | string | null }>(
      `select commission_cents from partner_commissions where id = $1`,
      [revenueRow.referral_commission_id],
    ).catch(() => null);
    if (c) splitCents = Math.max(0, Math.round(num(c.commission_cents)));
  }

  if (splitCents <= 0) return splits;

  // Cap the split at the fee basis when known (a split should never exceed the
  // fee it is a share of). split_percentage is reference only, for display.
  const amount = feeCents > 0 ? Math.min(splitCents, feeCents) : splitCents;
  const splitPct = feeCents > 0 ? Math.round((amount / feeCents) * 10000) / 100 : null;

  splits.push({
    recipient_kind: "partner",
    recipient_partner_id: partnerId,
    basis_cents: feeCents,
    split_percentage: splitPct,
    amount_cents: amount,
  });

  return splits;
}

/**
 * Find the connect_accounts row id for a computed split's recipient, if any, and
 * whether that account has payouts enabled. Returns { id, payoutsEnabled }.
 */
async function findRecipientAccount(
  split: ComputedSplit,
): Promise<{ id: string | null; payoutsEnabled: boolean }> {
  let row: { id: string; payouts_enabled: boolean } | null = null;
  if (split.recipient_partner_id) {
    row = await q1(
      `select id, payouts_enabled from connect_accounts
        where owner_partner_id = $1 order by updated_at desc limit 1`,
      [split.recipient_partner_id],
    );
  } else if (split.recipient_organization_id) {
    row = await q1(
      `select id, payouts_enabled from connect_accounts
        where owner_organization_id = $1 order by updated_at desc limit 1`,
      [split.recipient_organization_id],
    );
  } else if (split.recipient_user_id) {
    row = await q1(
      `select id, payouts_enabled from connect_accounts
        where owner_user_id = $1 order by updated_at desc limit 1`,
      [split.recipient_user_id],
    );
  }
  return { id: row?.id ?? null, payoutsEnabled: !!row?.payouts_enabled };
}

export interface EnqueueResult {
  created: number;
}

/**
 * Load the platform_revenue row, compute its splits, and insert one
 * payout_instructions row per split (status 'pending', or 'ready' when the
 * recipient already has a payouts-enabled connect account). Idempotent: if any
 * instructions already exist for this revenue id, nothing is inserted. Best
 * effort: any failure is swallowed and reported as { created: 0 }, so this can
 * never break the revenue-collected flow it is wired onto.
 */
export async function enqueueSplitsForRevenue(
  revenueId: string,
  actorEmail: string | null,
): Promise<EnqueueResult> {
  try {
    if (!revenueId) return { created: 0 };

    // Degrade gracefully on a partially-migrated database.
    const ready = await q1<{ reg: string | null }>(
      `select to_regclass('public.payout_instructions') as reg`,
    ).catch(() => null);
    if (!ready?.reg) return { created: 0 };

    // Idempotency: skip if this revenue id already has instructions.
    const existing = await q1<{ id: string }>(
      `select id from payout_instructions where source_revenue_id = $1 limit 1`,
      [revenueId],
    );
    if (existing) return { created: 0 };

    const rev = await q1<PlatformRevenueRow>(
      `select id, organization_id, source_payment_id, base_cents, fee_cents,
              referral_partner_id, referral_commission_id, referral_split_cents
         from platform_revenue where id = $1`,
      [revenueId],
    );
    if (!rev) return { created: 0 };

    const splits = await computeSplits(rev);
    if (!splits.length) return { created: 0 };

    let created = 0;
    for (const s of splits) {
      const acct = await findRecipientAccount(s);
      const status = acct.id && acct.payoutsEnabled ? "ready" : "pending";
      const inserted = await q1<{ id: string }>(
        `insert into payout_instructions
           (source_revenue_id, source_payment_id, recipient_kind,
            recipient_partner_id, recipient_organization_id, recipient_user_id,
            connect_account_id, basis_cents, split_percentage, amount_cents, currency, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'usd',$11)
         returning id`,
        [
          rev.id,
          rev.source_payment_id ?? null,
          s.recipient_kind,
          s.recipient_partner_id ?? null,
          s.recipient_organization_id ?? null,
          s.recipient_user_id ?? null,
          acct.id,
          s.basis_cents,
          s.split_percentage,
          s.amount_cents,
          status,
        ],
      );
      if (inserted?.id) {
        created += 1;
        await q(
          `insert into connect_payout_audit (instruction_id, actor_email, action, detail)
           values ($1,$2,'enqueued',$3::jsonb)`,
          [
            inserted.id,
            actorEmail ?? null,
            JSON.stringify({
              source_revenue_id: rev.id,
              recipient_kind: s.recipient_kind,
              amount_cents: s.amount_cents,
              status,
            }),
          ],
        );
      }
    }
    return { created };
  } catch {
    // Best effort: never throw into the caller (the revenue collect flow).
    return { created: 0 };
  }
}
