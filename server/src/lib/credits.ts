/**
 * Module 2 - Platform Credits engine (platform_credits ledger).
 *
 * Credits are NON-cash, non-transferable, non-withdrawable platform value that
 * can only be redeemed toward a Divini Partners subscription / membership.
 * There is deliberately NO payout path here: the only debit is redeemCredit,
 * and it asserts a subscription context. Balance is derived deterministically
 * from the append-only ledger:
 *
 *     balance = sum(earned) - sum(redeemed) - sum(expired)
 *
 * 'pending' rows (e.g. the referred user's 50%-off-first-two-months signup
 * incentive) are tracked but NOT spendable and never affect the balance; the
 * billing flow reads them and converts them to a discount at its own pace.
 *
 * Grants and redemptions are audited by the caller via lib/audit.ts.
 */
import { q, q1 } from "../pool.js";

export type CreditKind = "earned" | "redeemed" | "expired" | "pending";

export type CreditRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  amount_cents: string | number;
  kind: CreditKind;
  reason: string | null;
  source_referral_id: string | null;
  expires_at: string | null;
  created_at: string;
};

export type CreditSummary = {
  /** Spendable balance in cents: earned - redeemed - expired. Never below 0. */
  balanceCents: number;
  earnedCents: number;
  redeemedCents: number;
  expiredCents: number;
  /** Committed-but-not-yet-active incentive value (not spendable). */
  pendingCents: number;
};

/** Normalize a possibly-bigint-as-string amount to a finite integer cents. */
function cents(v: string | number | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Deterministic ledger summary for a user. */
export async function creditSummary(userId: string): Promise<CreditSummary> {
  const row = await q1<{
    earned: string | null;
    redeemed: string | null;
    expired: string | null;
    pending: string | null;
  }>(
    `select
       coalesce(sum(amount_cents) filter (where kind = 'earned'), 0)   as earned,
       coalesce(sum(amount_cents) filter (where kind = 'redeemed'), 0) as redeemed,
       coalesce(sum(amount_cents) filter (where kind = 'expired'), 0)  as expired,
       coalesce(sum(amount_cents) filter (where kind = 'pending'), 0)  as pending
     from platform_credits where user_id = $1`,
    [userId],
  );
  const earnedCents = cents(row?.earned);
  const redeemedCents = cents(row?.redeemed);
  const expiredCents = cents(row?.expired);
  const pendingCents = cents(row?.pending);
  const balanceCents = Math.max(0, earnedCents - redeemedCents - expiredCents);
  return { balanceCents, earnedCents, redeemedCents, expiredCents, pendingCents };
}

/** Spendable balance only (earned - redeemed - expired, floored at 0). */
export async function creditBalance(userId: string): Promise<number> {
  return (await creditSummary(userId)).balanceCents;
}

/** The user's ledger rows, newest first. */
export async function listLedger(userId: string): Promise<CreditRow[]> {
  return q<CreditRow>(
    `select id, user_id, organization_id, amount_cents, kind, reason,
            source_referral_id, expires_at, created_at
       from platform_credits where user_id = $1 order by created_at desc`,
    [userId],
  );
}

/**
 * Grant credit (an 'earned' ledger row). Used when a referral converts. Amount
 * must be a positive integer of cents. Returns the new row.
 */
export async function grantCredit(
  userId: string,
  amountCents: number,
  reason: string,
  opts: { sourceReferralId?: string | null; organizationId?: string | null; expiresAt?: string | null } = {},
): Promise<CreditRow> {
  const amount = Math.trunc(amountCents);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("grantCredit: amount must be a positive number of cents");
  }
  const row = await q1<CreditRow>(
    `insert into platform_credits
       (user_id, organization_id, amount_cents, kind, reason, source_referral_id, expires_at)
     values ($1, $2, $3, 'earned', $4, $5, $6)
     returning id, user_id, organization_id, amount_cents, kind, reason,
               source_referral_id, expires_at, created_at`,
    [userId, opts.organizationId ?? null, amount, reason, opts.sourceReferralId ?? null, opts.expiresAt ?? null],
  );
  return row as CreditRow;
}

/**
 * Record a 'pending' incentive credit (not spendable, does not affect balance).
 * Used for the referred user's signup incentive (50% off first two months -> two
 * pending rows the billing flow reads and applies). Distinct from grantCredit so
 * pending value never leaks into the spendable balance.
 */
export async function recordPendingIncentive(
  userId: string,
  amountCents: number,
  reason: string,
  opts: { sourceReferralId?: string | null; organizationId?: string | null; expiresAt?: string | null } = {},
): Promise<CreditRow> {
  const amount = Math.trunc(amountCents);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("recordPendingIncentive: amount must be a non-negative number of cents");
  }
  const row = await q1<CreditRow>(
    `insert into platform_credits
       (user_id, organization_id, amount_cents, kind, reason, source_referral_id, expires_at)
     values ($1, $2, $3, 'pending', $4, $5, $6)
     returning id, user_id, organization_id, amount_cents, kind, reason,
               source_referral_id, expires_at, created_at`,
    [userId, opts.organizationId ?? null, amount, reason, opts.sourceReferralId ?? null, opts.expiresAt ?? null],
  );
  return row as CreditRow;
}

export class CreditError extends Error {
  status = 400;
  constructor(msg: string) {
    super(msg);
    this.name = "CreditError";
  }
}

/**
 * Redeem credit toward a subscription / membership ONLY. The caller MUST assert
 * the redemption is for subscription/membership purposes by passing a non-empty
 * `context` (e.g. "subscription:partner-monthly"); a generic or missing context
 * is rejected. Never redeems below zero. There is no cash-out path: this is the
 * only debit and it always lands as a 'redeemed' ledger row tied to a sub.
 */
export async function redeemCredit(
  userId: string,
  amountCents: number,
  reason: string,
  context: { purpose: "subscription" | "membership"; ref?: string | null; organizationId?: string | null },
): Promise<{ redeemed: CreditRow; balanceCents: number }> {
  const amount = Math.trunc(amountCents);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new CreditError("redeem amount must be a positive number of cents");
  }
  if (!context || (context.purpose !== "subscription" && context.purpose !== "membership")) {
    throw new CreditError("credits can only be redeemed toward a subscription or membership");
  }
  const balance = await creditBalance(userId);
  if (amount > balance) {
    throw new CreditError("insufficient credit balance for this redemption");
  }
  const fullReason = context.ref ? `${reason} (${context.purpose}:${context.ref})` : `${reason} (${context.purpose})`;
  const row = await q1<CreditRow>(
    `insert into platform_credits
       (user_id, organization_id, amount_cents, kind, reason)
     values ($1, $2, $3, 'redeemed', $4)
     returning id, user_id, organization_id, amount_cents, kind, reason,
               source_referral_id, expires_at, created_at`,
    [userId, context.organizationId ?? null, amount, fullReason],
  );
  const balanceCents = await creditBalance(userId);
  return { redeemed: row as CreditRow, balanceCents };
}

/** Format cents as a USD string for notifications and the dashboard. */
export function formatUsd(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}
