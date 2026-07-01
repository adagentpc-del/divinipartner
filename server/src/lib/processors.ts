/**
 * Payment processors: Stripe + PayPal, via direct REST (global fetch) so we add
 * zero SDK dependencies. Feature-flagged through config: when a processor's keys
 * are absent it is "disabled" and callers fall back to record-only.
 *
 * MVP model: the client pays into the Divini platform account (Stripe Checkout
 * Session / PayPal Order). On success the caller records the payment with the
 * existing fee breakdown; the vendor payout is tracked via payout_status. Full
 * marketplace splits (Stripe Connect / PayPal multiparty) are a later phase.
 *
 * Metadata round-trip: Stripe carries the full metadata set on the session;
 * PayPal packs org/invoice/event ids into the order custom_id (127-char limit).
 * The synchronous capture endpoint does not rely on metadata (it has the authed
 * actor); webhooks use metadata as the backstop.
 */
import crypto from "node:crypto";
import {
  STRIPE_SECRET_KEY,
  STRIPE_PUBLISHABLE_KEY,
  STRIPE_WEBHOOK_SECRET,
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_WEBHOOK_ID,
  PAYMENT_CURRENCY,
  stripeEnabled,
  paypalEnabled,
  paypalApiBase,
  PRICING_V2,
  PLATFORM_FEE_RATE_V2,
} from "../config.js";

export type Processor = "stripe" | "paypal";

export interface CheckoutInput {
  processor: Processor;
  amount: number; // in major units (dollars)
  currency?: string;
  label: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
  // Stripe Connect split: when the vendor has a connected account, route their
  // net to them and keep the platform fee. Ignored by PayPal (which splits via
  // a Payout after capture).
  applicationFeeCents?: number;
  destinationAccount?: string;
}

export interface ConnectStatus {
  id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
}

export interface PayoutResult {
  ok: boolean;
  reference: string;
  status: string;
}

export interface CheckoutResult {
  processor: Processor;
  redirect_url: string;
  session_ref: string;
}

export interface CaptureResult {
  paid: boolean;
  amount: number; // major units
  currency: string;
  reference: string; // unique processor reference for dedupe
  raw_status: string;
  metadata: Record<string, string>;
}

export function enabledProcessors(): {
  stripe: boolean;
  paypal: boolean;
  stripe_publishable_key: string;
  currency: string;
  pricing_v2: boolean;
  platform_fee_rate: number;
} {
  return {
    stripe: stripeEnabled(),
    paypal: paypalEnabled(),
    stripe_publishable_key: STRIPE_PUBLISHABLE_KEY,
    currency: PAYMENT_CURRENCY,
    // Pricing V2 signal for the client so the checkout / invoice display can
    // show the on-top fee breakdown without a build-time env. Read-only; the
    // server remains the source of truth for all money math.
    pricing_v2: PRICING_V2,
    platform_fee_rate: PLATFORM_FEE_RATE_V2,
  };
}

export function processorEnabled(p: Processor): boolean {
  return p === "stripe" ? stripeEnabled() : paypalEnabled();
}

function toCents(amount: number): number {
  return Math.round((Number(amount) || 0) * 100);
}

// ---------------------------------------------------------------------------
// Stripe (Checkout Sessions, form-encoded REST)
// ---------------------------------------------------------------------------

async function stripeForm(path: string, params: URLSearchParams): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message || `stripe ${res.status}`;
    throw new Error(`stripe: ${err}`);
  }
  return json;
}

async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json.error as { message?: string } | undefined)?.message || `stripe ${res.status}`;
    throw new Error(`stripe: ${err}`);
  }
  return json;
}

async function stripeCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const currency = (input.currency || PAYMENT_CURRENCY).toLowerCase();
  const p = new URLSearchParams();
  p.set("mode", "payment");
  p.set("success_url", input.successUrl);
  p.set("cancel_url", input.cancelUrl);
  p.set("line_items[0][quantity]", "1");
  p.set("line_items[0][price_data][currency]", currency);
  p.set("line_items[0][price_data][product_data][name]", input.label.slice(0, 250));
  p.set("line_items[0][price_data][unit_amount]", String(toCents(input.amount)));
  for (const [k, v] of Object.entries(input.metadata)) {
    if (v) p.set(`metadata[${k}]`, String(v).slice(0, 480));
  }
  // Auto-split to the connected vendor account when present.
  if (input.destinationAccount) {
    p.set("payment_intent_data[transfer_data][destination]", input.destinationAccount);
    if (input.applicationFeeCents && input.applicationFeeCents > 0) {
      p.set("payment_intent_data[application_fee_amount]", String(Math.round(input.applicationFeeCents)));
    }
  }
  const session = await stripeForm("/v1/checkout/sessions", p);
  const url = session.url as string | undefined;
  const id = session.id as string | undefined;
  if (!url || !id) throw new Error("stripe: no session url returned");
  return { processor: "stripe", redirect_url: url, session_ref: id };
}

async function stripeCapture(sessionRef: string): Promise<CaptureResult> {
  const s = await stripeGet(`/v1/checkout/sessions/${encodeURIComponent(sessionRef)}`);
  const paid = s.payment_status === "paid";
  const amountTotal = Number(s.amount_total ?? 0) / 100;
  const currency = String(s.currency ?? PAYMENT_CURRENCY).toUpperCase();
  const reference = String((s.payment_intent as string) || s.id || sessionRef);
  const metadata = (s.metadata as Record<string, string> | null) ?? {};
  return { paid, amount: amountTotal, currency, reference, raw_status: String(s.payment_status ?? ""), metadata };
}

/** Verify a Stripe webhook signature against the raw request body. Returns the
 *  parsed event when valid, otherwise null. */
export function verifyStripeEvent(rawBody: Buffer | string, sigHeader: string | undefined): Record<string, unknown> | null {
  if (!STRIPE_WEBHOOK_SECRET || !sigHeader) return null;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = parts["t"];
  const v1 = parts["v1"];
  if (!t || !v1) return null;
  // M1: bound the timestamp to defeat replay. Reject events whose signed time is
  // more than 5 minutes from now (in either direction).
  const tsec = Number(t);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsec) || Math.abs(nowSeconds - tsec) > 300) return null;
  const payload = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const expected = crypto.createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// PayPal (Orders v2, JSON REST)
// ---------------------------------------------------------------------------

async function paypalToken(): Promise<string> {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`paypal token: ${json.error_description ?? res.status}`);
  return String(json.access_token);
}

function packCustomId(metadata: Record<string, string>): string {
  // PayPal custom_id is capped at 127 chars. Pack the ids we need to record a
  // payment in the webhook backstop; tier/flow are recomputed there.
  const out: string[] = [];
  if (metadata.org_id) out.push(`o:${metadata.org_id}`);
  if (metadata.invoice_id) out.push(`i:${metadata.invoice_id}`);
  if (metadata.event_id) out.push(`e:${metadata.event_id}`);
  return out.join("|").slice(0, 127);
}

export function unpackCustomId(custom: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!custom) return out;
  for (const seg of custom.split("|")) {
    const i = seg.indexOf(":");
    if (i < 0) continue;
    const key = seg.slice(0, 1);
    const val = seg.slice(i + 1);
    if (key === "o") out.org_id = val;
    else if (key === "i") out.invoice_id = val;
    else if (key === "e") out.event_id = val;
  }
  return out;
}

async function paypalCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const token = await paypalToken();
  const currency = (input.currency || PAYMENT_CURRENCY).toUpperCase();
  const body = {
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: { currency_code: currency, value: (Number(input.amount) || 0).toFixed(2) },
        description: input.label.slice(0, 127),
        custom_id: packCustomId(input.metadata),
      },
    ],
    application_context: {
      brand_name: "Divini Partners",
      user_action: "PAY_NOW",
      return_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
  };
  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`paypal order: ${(json.message as string) ?? res.status}`);
  const links = (json.links as { rel: string; href: string }[] | undefined) ?? [];
  const approve = links.find((l) => l.rel === "approve" || l.rel === "payer-action");
  const id = json.id as string | undefined;
  if (!approve || !id) throw new Error("paypal: no approval link returned");
  return { processor: "paypal", redirect_url: approve.href, session_ref: id };
}

async function paypalCapture(orderId: string): Promise<CaptureResult> {
  const token = await paypalToken();
  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    // Already-captured orders return 422; treat as a lookup instead of a hard error.
    if (res.status === 422) {
      const look = await paypalGetOrder(orderId, token);
      if (look) return look;
    }
    throw new Error(`paypal capture: ${(json.message as string) ?? res.status}`);
  }
  return paypalResultFromOrder(json, orderId);
}

async function paypalGetOrder(orderId: string, token: string): Promise<CaptureResult | null> {
  const res = await fetch(`${paypalApiBase()}/v2/checkout/orders/${encodeURIComponent(orderId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, unknown>;
  return paypalResultFromOrder(json, orderId);
}

function paypalResultFromOrder(order: Record<string, unknown>, orderId: string): CaptureResult {
  const status = String(order.status ?? "");
  const units = (order.purchase_units as Record<string, unknown>[] | undefined) ?? [];
  const unit = units[0] ?? {};
  const payments = (unit.payments as { captures?: Record<string, unknown>[] } | undefined) ?? {};
  const cap = (payments.captures ?? [])[0] ?? {};
  const amtObj = (cap.amount as { value?: string; currency_code?: string } | undefined) ??
    (unit.amount as { value?: string; currency_code?: string } | undefined) ?? {};
  const custom = (cap.custom_id as string | undefined) ?? (unit.custom_id as string | undefined);
  return {
    paid: status === "COMPLETED",
    amount: Number(amtObj.value ?? 0),
    currency: String(amtObj.currency_code ?? PAYMENT_CURRENCY).toUpperCase(),
    reference: String((cap.id as string) || orderId),
    raw_status: status,
    metadata: unpackCustomId(custom),
  };
}

/** Verify a PayPal webhook by calling PayPal's verify-webhook-signature API. When
 *  PAYPAL_WEBHOOK_ID is unset (e.g. sandbox), verification is skipped (returns
 *  false so callers can decide; the route treats unset id as "skip + trust"). */
export async function verifyPaypalWebhook(
  headers: Record<string, string | undefined>,
  eventBody: unknown,
): Promise<boolean> {
  if (!PAYPAL_WEBHOOK_ID) return false;
  const token = await paypalToken();
  const res = await fetch(`${paypalApiBase()}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_algo: headers["paypal-auth-algo"],
      cert_url: headers["paypal-cert-url"],
      transmission_id: headers["paypal-transmission-id"],
      transmission_sig: headers["paypal-transmission-sig"],
      transmission_time: headers["paypal-transmission-time"],
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: eventBody,
    }),
  });
  if (!res.ok) return false;
  const json = (await res.json()) as { verification_status?: string };
  return json.verification_status === "SUCCESS";
}

export const paypalWebhookIdSet = (): boolean => !!PAYPAL_WEBHOOK_ID;

// ---------------------------------------------------------------------------
// Stripe Connect (Express) onboarding + status
// ---------------------------------------------------------------------------

function connectStatusFrom(acct: Record<string, unknown>): ConnectStatus {
  return {
    id: String(acct.id ?? ""),
    charges_enabled: !!acct.charges_enabled,
    payouts_enabled: !!acct.payouts_enabled,
    details_submitted: !!acct.details_submitted,
  };
}

/** Create a Stripe Express connected account for a vendor org. */
export async function createConnectAccount(email?: string | null): Promise<ConnectStatus> {
  const p = new URLSearchParams();
  p.set("type", "express");
  p.set("capabilities[card_payments][requested]", "true");
  p.set("capabilities[transfers][requested]", "true");
  if (email) p.set("email", email);
  const acct = await stripeForm("/v1/accounts", p);
  return connectStatusFrom(acct);
}

/** Hosted onboarding link the vendor completes to enable payouts. */
export async function createAccountLink(
  accountId: string,
  refreshUrl: string,
  returnUrl: string,
): Promise<string> {
  const p = new URLSearchParams();
  p.set("account", accountId);
  p.set("refresh_url", refreshUrl);
  p.set("return_url", returnUrl);
  p.set("type", "account_onboarding");
  const link = await stripeForm("/v1/account_links", p);
  const url = link.url as string | undefined;
  if (!url) throw new Error("stripe: no account link url");
  return url;
}

export async function retrieveConnectAccount(accountId: string): Promise<ConnectStatus> {
  const acct = await stripeGet(`/v1/accounts/${encodeURIComponent(accountId)}`);
  return connectStatusFrom(acct);
}

// ---------------------------------------------------------------------------
// PayPal Payouts (disburse the vendor's net after capture)
// ---------------------------------------------------------------------------

export async function createPaypalPayout(
  receiverEmail: string,
  amount: number,
  currency: string,
  note: string,
  senderItemId: string,
): Promise<PayoutResult> {
  const token = await paypalToken();
  const body = {
    sender_batch_header: {
      sender_batch_id: `divini_${senderItemId}_${Date.now()}`,
      email_subject: "You have a payout from Divini Partners",
      email_message: note.slice(0, 200),
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: { value: (Number(amount) || 0).toFixed(2), currency: currency.toUpperCase() },
        receiver: receiverEmail,
        note: note.slice(0, 200),
        sender_item_id: senderItemId.slice(0, 63),
      },
    ],
  };
  const res = await fetch(`${paypalApiBase()}/v1/payments/payouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, reference: "", status: String((json.message as string) ?? res.status) };
  }
  const header = (json.batch_header as { payout_batch_id?: string; batch_status?: string } | undefined) ?? {};
  return { ok: true, reference: String(header.payout_batch_id ?? ""), status: String(header.batch_status ?? "PENDING") };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

export async function createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  if (!processorEnabled(input.processor)) {
    throw new Error(`${input.processor} is not configured`);
  }
  return input.processor === "stripe" ? stripeCheckout(input) : paypalCheckout(input);
}

export async function captureCheckout(processor: Processor, sessionRef: string): Promise<CaptureResult> {
  if (!processorEnabled(processor)) throw new Error(`${processor} is not configured`);
  return processor === "stripe" ? stripeCapture(sessionRef) : paypalCapture(sessionRef);
}
