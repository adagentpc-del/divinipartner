/**
 * Divini Partners - real recurring SUBSCRIPTION billing (Stripe), fetch-based
 * REST like lib/stripe-connect.ts (no npm SDK). This is what actually charges
 * an organization for its Plus/Pro tier every month; the legacy `tier` column
 * on organizations only reflects what a real, active Stripe subscription says
 * it is (set by the webhook in routes/payments.ts, never self-declared).
 *
 * Uses Checkout Session `mode: "subscription"` with an inline `price_data`
 * line item (recurring), so no Stripe-dashboard Product/Price setup is
 * required first -- consistent with how lib/processors.ts already creates
 * one-time price_data line items for the existing payment flows.
 *
 * Zero em dashes.
 */
import { q1 } from "../pool.js";
import { TIERS, type Tier, type DbOrg } from "../db.js";

const STRIPE_API = "https://api.stripe.com";

export function isConfigured(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY || "").trim();
}

export class StripeNotConfigured extends Error {
  code = "stripe_not_configured" as const;
  constructor(msg = "Stripe is not configured for subscription billing") {
    super(msg);
    this.name = "StripeNotConfigured";
  }
}

function secret(): string {
  const k = (process.env.STRIPE_SECRET_KEY || "").trim();
  if (!k) throw new StripeNotConfigured();
  return k;
}

function formEncode(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const k = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = formEncode(value as Record<string, unknown>, k);
      if (nested) parts.push(nested);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.join("&");
}

async function stripePost<T = any>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formEncode(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as Record<string, unknown> | undefined) ?? {};
    throw new Error(String(err.message ?? res.statusText ?? "stripe error"));
  }
  return json as T;
}

/**
 * Only tiers with a real monthly price go through Stripe; TIERS itself is the
 * single source of truth for the dollar figures (spec section 2), never
 * duplicated here.
 */
export const SUBSCRIBABLE_TIERS: Tier[] = (Object.keys(TIERS) as Tier[]).filter(
  (t) => TIERS[t].monthly > 0,
);

export function isSubscribableTier(tier: string): tier is Tier {
  return (SUBSCRIBABLE_TIERS as string[]).includes(tier);
}

/** Get-or-create the org's Stripe Customer, persisting the id once created. */
export async function ensureStripeCustomer(
  org: Pick<DbOrg, "id" | "name" | "stripe_customer_id">,
  email?: string | null,
): Promise<string> {
  if (org.stripe_customer_id) return org.stripe_customer_id;
  const body: Record<string, unknown> = { name: org.name, metadata: { org_id: org.id } };
  if (email) body.email = email;
  const customer = await stripePost<{ id: string }>("/v1/customers", body);
  await q1(`update organizations set stripe_customer_id = $2, updated_at = now() where id = $1`, [
    org.id,
    customer.id,
  ]);
  return customer.id;
}

/**
 * Start a real recurring subscription checkout for a paid tier. The org's
 * `tier` column is NOT changed here -- only the webhook (on a confirmed
 * customer.subscription.* event) ever promotes it, so a user cannot claim a
 * paid tier by hitting cancel on the Stripe-hosted page.
 */
export async function createSubscriptionCheckout(args: {
  org: Pick<DbOrg, "id" | "name" | "stripe_customer_id">;
  email?: string | null;
  tier: Tier;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ redirect_url: string; session_ref: string }> {
  if (!isConfigured()) throw new StripeNotConfigured();
  if (!isSubscribableTier(args.tier)) {
    throw new Error(`${args.tier} has no monthly price and cannot be subscribed to`);
  }
  const plan = TIERS[args.tier];
  const customerId = await ensureStripeCustomer(args.org, args.email);

  const session = await stripePost<{ id: string; url: string }>("/v1/checkout/sessions", {
    mode: "subscription",
    customer: customerId,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(plan.monthly * 100),
          recurring: { interval: "month" },
          product_data: { name: `Divini Partners - ${plan.label}` },
        },
      },
    ],
    subscription_data: {
      metadata: { org_id: args.org.id, tier: args.tier },
    },
    metadata: { org_id: args.org.id, tier: args.tier, purpose: "org_subscription" },
  });
  if (!session.url || !session.id) throw new Error("stripe: no checkout session url returned");
  return { redirect_url: session.url, session_ref: session.id };
}

/** Cancel an org's active Stripe subscription (downgrade takes effect once the
 *  webhook processes the resulting customer.subscription.deleted event). */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  if (!isConfigured()) throw new StripeNotConfigured();
  const res = await fetch(`${STRIPE_API}/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${secret()}` },
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const err = (json.error as Record<string, unknown> | undefined) ?? {};
    throw new Error(String(err.message ?? res.statusText ?? "stripe error"));
  }
}
