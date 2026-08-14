/**
 * Divini Partners - STRIPE ACCOUNTS V2 adapter (fetch-based, no npm dependency,
 * matching lib/stripe-connect.ts / lib/processors.ts / lib/stripeBilling.ts).
 *
 * A connected account created here is configured as BOTH:
 *   - a merchant: can accept DIRECT-charge payments from its own customers.
 *     The connected account is the merchant of record for the charge (not
 *     the platform) -- Stripe automatically routes `application_fee_amount`
 *     to the platform's own account. This is a different Connect pattern
 *     from the existing lib/processors.ts checkout, which creates a
 *     DESTINATION charge (charge on the PLATFORM account, `transfer_data`
 *     auto-splits the net OUT to the vendor). Both are valid; this app now
 *     supports both, selected per-org by which onboarding path they
 *     completed -- see db/payout-accounts.ts's `stripe_api_version`.
 *   - a platform customer: can be billed the org's Divini Partners
 *     subscription fee straight from its own Stripe balance (no separate
 *     card on file needed), alongside the existing card-based path in
 *     lib/stripeBilling.ts (unchanged, still fully supported).
 *
 * v2 endpoints (/v2/core/...) use a JSON request/response body, unlike the
 * v1 API's form-encoded bodies used elsewhere in this codebase -- a real,
 * deliberate difference, not an inconsistency to "fix."
 *
 * SAFETY: every function is guarded on STRIPE_SECRET_KEY, throwing a typed
 * StripeNotConfigured error so routes can degrade gracefully (matching
 * lib/stripe-connect.ts's contract).
 *
 * NOT LIVE-VERIFIED: this module was built and typechecked without a real
 * Stripe test-mode secret key available in the build environment, so no
 * actual API calls were exercised. Verify against Stripe test mode with a
 * real STRIPE_SECRET_KEY before relying on this in any environment that
 * matters -- see AI_PROJECT_OS/23_DEPLOYMENT.md.
 *
 * Zero em dashes.
 */
import { STRIPE_SECRET_KEY } from "../config.js";

const STRIPE_API = "https://api.stripe.com";

export function isConfigured(): boolean {
  return !!(STRIPE_SECRET_KEY || "").trim();
}

export class StripeNotConfigured extends Error {
  code = "stripe_not_configured" as const;
  constructor(msg = "Stripe is not configured") {
    super(msg);
    this.name = "StripeNotConfigured";
  }
}

export class StripeApiError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.name = "StripeApiError";
    this.status = status;
  }
}

function secret(): string {
  const k = (STRIPE_SECRET_KEY || "").trim();
  if (!k) throw new StripeNotConfigured();
  return k;
}

// ---- v1 (form-encoded), reused for direct-charge Checkout Sessions and the
// balance-funded Subscription -------------------------------------------

function formEncode(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const k = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        const nested =
          typeof item === "object" && item !== null
            ? formEncode(item as Record<string, unknown>, `${k}[${i}]`)
            : `${encodeURIComponent(`${k}[${i}]`)}=${encodeURIComponent(String(item))}`;
        if (nested) parts.push(nested);
      });
    } else if (typeof value === "object") {
      const nested = formEncode(value as Record<string, unknown>, k);
      if (nested) parts.push(nested);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}

async function stripePostV1<T = any>(
  path: string,
  body: Record<string, unknown>,
  opts: { stripeAccount?: string; idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${secret()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  // Direct charge: perform the request "as" the connected account. This is
  // what makes the resulting Charge/PaymentIntent belong to the connected
  // account (merchant of record) rather than the platform.
  if (opts.stripeAccount) headers["Stripe-Account"] = opts.stripeAccount;
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers,
    body: formEncode(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as Record<string, unknown> | undefined) ?? {};
    throw new StripeApiError(res.status, String(err.message ?? res.statusText ?? "stripe error"));
  }
  return json as T;
}

// ---- v2 (JSON), for connected-account creation + onboarding ---------------

async function stripeJson<T = any>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${secret()}` };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(`${STRIPE_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as Record<string, unknown> | undefined) ?? {};
    throw new StripeApiError(res.status, String(err.message ?? res.statusText ?? "stripe error"));
  }
  return json as T;
}

// ---- Account creation + onboarding (v2) ------------------------------------

export interface MerchantAccountStatus {
  accountId: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
}

/**
 * Create a connected account configured as both a merchant (accepts direct
 * charges) and a platform customer (can be billed from its own balance).
 * `defaults.responsibilities` assigns fee/loss collection to Stripe (the
 * standard marketplace posture: Stripe, not this platform, is the
 * merchant-of-record's payment facilitator for compliance purposes).
 *
 * Deliberately does NOT send `configuration.merchant.simulate_accept_tos_obo`
 * -- that parameter only works in Stripe TEST MODE and simulates ToS
 * acceptance instead of the real Stripe-hosted flow. Production onboarding
 * always goes through createAccountOnboardingLink()'s real, hosted link;
 * simulate the acceptance only from a test-mode-only script/tool, never from
 * this shared code path.
 */
export async function createMerchantAccount(args: {
  displayName: string;
  contactEmail: string;
  country: string;
  phone: string;
}): Promise<{ accountId: string }> {
  if (!isConfigured()) throw new StripeNotConfigured();
  const account = await stripeJson<{ id: string }>("POST", "/v2/core/accounts", {
    display_name: args.displayName,
    contact_email: args.contactEmail,
    configuration: { merchant: {}, customer: {} },
    include: [
      "configuration.merchant",
      "configuration.recipient",
      "identity",
      "defaults",
      "configuration.customer",
    ],
    identity: {
      country: args.country,
      business_details: { phone: args.phone },
    },
    dashboard: "full",
    defaults: {
      responsibilities: { losses_collector: "stripe", fees_collector: "stripe" },
    },
  });
  return { accountId: account.id };
}

/** Stripe-hosted onboarding link collecting KYC for both the merchant and
 *  customer configurations in one flow. */
export async function createAccountOnboardingLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string,
): Promise<{ url: string }> {
  if (!isConfigured()) throw new StripeNotConfigured();
  const link = await stripeJson<{ url: string }>("POST", "/v2/core/account_links", {
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "customer"],
        refresh_url: refreshUrl,
        return_url: returnUrl,
      },
    },
  });
  return { url: link.url };
}

/**
 * Re-fetch a v2 account's current capability status directly, rather than
 * trusting a webhook event's embedded fields. v2 capability-status webhook
 * events are "thin" (a reference, not a full object snapshot) BY DESIGN --
 * the correct way to handle a thin event is always to look the resource up,
 * not to guess at its payload shape. Used both by the capability-status
 * webhook handler and as a manual status-check fallback route.
 */
export async function retrieveMerchantAccount(accountId: string): Promise<MerchantAccountStatus> {
  if (!isConfigured()) throw new StripeNotConfigured();
  const account = await stripeJson<any>(
    "GET",
    `/v2/core/accounts/${encodeURIComponent(accountId)}?include=configuration.merchant`,
  );
  const merchant = account?.configuration?.merchant ?? {};
  return {
    accountId: account?.id ?? accountId,
    chargesEnabled: merchant?.capabilities?.card_payments?.status === "active",
    payoutsEnabled: merchant?.capabilities?.stripe_balance?.payouts?.status === "active",
    detailsSubmitted: !!merchant?.onboarding?.details_submitted,
  };
}

// ---- Direct-charge Checkout Session (v1, run "as" the connected account) --

export interface DirectCheckoutInput {
  accountId: string;
  amount: number; // major units (dollars)
  currency?: string;
  label: string;
  successUrl: string;
  cancelUrl: string;
  applicationFeeCents: number;
  metadata: Record<string, string>;
}

export interface DirectCheckoutResult {
  redirect_url: string;
  session_ref: string;
}

/**
 * Create a Checkout Session run AS the connected account (the `Stripe-Account`
 * header), with `payment_intent_data.application_fee_amount` skimming the
 * platform's cut. Unlike the existing destination-charge checkout in
 * lib/processors.ts, this sets NO `transfer_data` -- there is nothing to
 * transfer out, because the charge already belongs to the connected account.
 */
export async function createDirectCheckoutSession(
  input: DirectCheckoutInput,
): Promise<DirectCheckoutResult> {
  if (!isConfigured()) throw new StripeNotConfigured();
  const currency = (input.currency || "usd").toLowerCase();
  const session = await stripePostV1<{ id: string; url: string }>(
    "/v1/checkout/sessions",
    {
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: Math.round(input.amount * 100),
            product_data: { name: input.label.slice(0, 250) },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: Math.max(0, Math.round(input.applicationFeeCents)),
      },
      metadata: input.metadata,
    },
    { stripeAccount: input.accountId },
  );
  if (!session.url || !session.id) throw new Error("stripe: no checkout session url returned");
  return { redirect_url: session.url, session_ref: session.id };
}

// ---- Balance-funded platform subscription (v1, customer_account) ----------

/**
 * Attach the connected account's own Stripe balance as an off-session
 * payment method, so a subsequent subscription can be charged against it
 * without the account needing a separate card on file.
 */
export async function attachAccountBalancePaymentMethod(
  accountId: string,
): Promise<{ paymentMethodId: string }> {
  if (!isConfigured()) throw new StripeNotConfigured();
  const setupIntent = await stripePostV1<{ payment_method: string }>("/v1/setup_intents", {
    payment_method_types: ["stripe_balance"],
    confirm: true,
    customer_account: accountId,
    usage: "off_session",
    payment_method_data: { type: "stripe_balance" },
  });
  if (!setupIntent.payment_method) throw new Error("stripe: setup intent returned no payment method");
  return { paymentMethodId: setupIntent.payment_method };
}

/**
 * Charge the connected account's own Stripe balance for the platform
 * subscription fee. Uses an inline recurring `price_data` line item (no
 * pre-created Product/Price needed), matching the existing pattern in
 * lib/stripeBilling.ts's createSubscriptionCheckout -- the org's real
 * monthly price still comes from lib/planCatalog.ts / db.ts's TIERS via
 * that same module's resolveSubscriptionPlan(), never duplicated here.
 *
 * metadata carries { org_id, tier }, the SAME contract
 * routes/payments.ts's webhook already reads for the card-based path, so
 * customer.subscription.* handling needed no changes: metadata.org_id
 * already took priority over any customer-id lookup.
 */
export async function chargeAccountSubscription(args: {
  accountId: string;
  paymentMethodId: string;
  monthlyUsd: number;
  label: string;
  orgId: string;
  tier: string;
}): Promise<{ subscriptionId: string; status: string }> {
  if (!isConfigured()) throw new StripeNotConfigured();
  const sub = await stripePostV1<{ id: string; status: string }>("/v1/subscriptions", {
    customer_account: args.accountId,
    default_payment_method: args.paymentMethodId,
    items: [
      {
        price_data: {
          currency: "usd",
          unit_amount: Math.round(args.monthlyUsd * 100),
          recurring: { interval: "month" },
          product_data: { name: `Divini Partners - ${args.label}` },
        },
        quantity: 1,
      },
    ],
    payment_settings: { payment_method_types: ["stripe_balance"] },
    metadata: { org_id: args.orgId, tier: args.tier },
  });
  return { subscriptionId: sub.id, status: sub.status };
}
