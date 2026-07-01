/**
 * Payout accounts: where each org receives its share for automatic money splits.
 * Stripe = a connected Express account (external_id = acct_...); PayPal = the
 * org's payout email. Drives the split logic in routes/payments.ts.
 */
import { q1 } from "../pool.js";

export type PayoutProcessor = "stripe" | "paypal";

export interface PayoutAccount {
  id: string;
  organization_id: string;
  processor: PayoutProcessor;
  external_id: string | null;
  email: string | null;
  status: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  created_at: string;
  updated_at: string;
}

export async function getPayoutAccount(
  orgId: string,
  processor: PayoutProcessor,
): Promise<PayoutAccount | null> {
  return q1<PayoutAccount>(
    `select * from payout_accounts where organization_id = $1 and processor = $2`,
    [orgId, processor],
  );
}

export async function listPayoutAccounts(orgId: string): Promise<PayoutAccount[]> {
  const stripe = await getPayoutAccount(orgId, "stripe");
  const paypal = await getPayoutAccount(orgId, "paypal");
  return [stripe, paypal].filter((x): x is PayoutAccount => !!x);
}

/** Create or update the org's payout account for a processor. */
export async function upsertPayoutAccount(
  orgId: string,
  processor: PayoutProcessor,
  fields: Partial<Pick<PayoutAccount, "external_id" | "email" | "status" | "charges_enabled" | "payouts_enabled" | "details_submitted">>,
): Promise<PayoutAccount> {
  return (await q1<PayoutAccount>(
    `insert into payout_accounts
       (organization_id, processor, external_id, email, status,
        charges_enabled, payouts_enabled, details_submitted)
     values ($1,$2,$3,$4,coalesce($5,'pending'),
        coalesce($6,false),coalesce($7,false),coalesce($8,false))
     on conflict (organization_id, processor) do update set
        external_id = coalesce(excluded.external_id, payout_accounts.external_id),
        email = coalesce(excluded.email, payout_accounts.email),
        status = coalesce(nullif(excluded.status,''), payout_accounts.status),
        charges_enabled = excluded.charges_enabled,
        payouts_enabled = excluded.payouts_enabled,
        details_submitted = excluded.details_submitted,
        updated_at = now()
     returning *`,
    [
      orgId,
      processor,
      fields.external_id ?? null,
      fields.email ?? null,
      fields.status ?? null,
      fields.charges_enabled ?? null,
      fields.payouts_enabled ?? null,
      fields.details_submitted ?? null,
    ],
  )) as PayoutAccount;
}

/** Sync a Stripe connected account's capability flags by its acct_ id, driven by
 *  the account.updated webhook (so status flips without the vendor revisiting). */
export async function syncStripeAccountByExternalId(
  externalId: string,
  caps: { charges_enabled: boolean; payouts_enabled: boolean; details_submitted: boolean },
): Promise<PayoutAccount | null> {
  if (!externalId) return null;
  const status = caps.payouts_enabled ? "active" : caps.details_submitted ? "pending" : "onboarding";
  return q1<PayoutAccount>(
    `update payout_accounts
        set charges_enabled = $2, payouts_enabled = $3, details_submitted = $4,
            status = $5, updated_at = now()
      where processor = 'stripe' and external_id = $1
      returning *`,
    [externalId, caps.charges_enabled, caps.payouts_enabled, caps.details_submitted, status],
  );
}

/** Stripe destination account id, only when the account can actually receive
 *  funds (payouts enabled). Returns null otherwise so callers fall back to the
 *  record-only / platform-holds flow. */
export async function activeStripeDestination(orgId: string): Promise<string | null> {
  const a = await getPayoutAccount(orgId, "stripe");
  return a && a.payouts_enabled && a.external_id ? a.external_id : null;
}

/** Org's PayPal payout email when set. */
export async function paypalPayoutEmail(orgId: string): Promise<string | null> {
  const a = await getPayoutAccount(orgId, "paypal");
  return a && a.payouts_enabled && a.email ? a.email : null;
}
