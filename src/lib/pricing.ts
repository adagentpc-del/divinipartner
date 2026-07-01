/**
 * Pricing V2 client helpers (Wave 2).
 *
 * THE MODEL: under Pricing V2 the platform fee is a flat 5% ADDED ON TOP of the
 * vendor's price. The vendor receives their FULL quote subtotal; the client pays
 * subtotal + 5%; the platform keeps the 5%.
 *
 *   vendor quote $5,000 -> client pays $5,250 -> vendor receives $5,000.
 *
 * The server is always the source of truth for the money math (see
 * server/src/db/payments.ts computeOnTopCharge). These helpers exist only so the
 * SAME breakdown can be displayed consistently across the quote builder, the
 * checkout view, and the invoice detail view.
 *
 * Flag read: the build-time env VITE_PRICING_V2 is the default, but the runtime
 * value from GET /api/payments/processors ({ pricing_v2, platform_fee_rate })
 * always wins when supplied (see setPricingV2FromServer). Zero em dashes.
 */

/** Build-time client flag. Mirrors the server PRICING_V2 master flag. */
export const PRICING_V2: boolean =
  String((import.meta as { env?: Record<string, string> }).env?.VITE_PRICING_V2 ?? '').toLowerCase() === 'true';

/** Flat platform fee rate under Pricing V2 (added on top of the vendor price). */
export const PLATFORM_FEE_RATE_V2 = 0.05;

let runtimePricingV2: boolean | null = null;
let runtimeFeeRate: number | null = null;

/**
 * Adopt the runtime flag delivered by the server (GET /api/payments/processors).
 * Call this once after fetching processors so the display matches the server,
 * regardless of the build-time env. Safe to call repeatedly.
 */
export function setPricingV2FromServer(v: { pricing_v2?: boolean; platform_fee_rate?: number } | null | undefined): void {
  if (!v) return;
  if (typeof v.pricing_v2 === 'boolean') runtimePricingV2 = v.pricing_v2;
  if (typeof v.platform_fee_rate === 'number' && Number.isFinite(v.platform_fee_rate)) runtimeFeeRate = v.platform_fee_rate;
}

/** The effective flag: the server runtime value when known, else the build-time env. */
export function pricingV2Active(): boolean {
  return runtimePricingV2 ?? PRICING_V2;
}

/** The effective flat fee rate: the server runtime value when known, else 5%. */
export function platformFeeRate(): number {
  return runtimeFeeRate ?? PLATFORM_FEE_RATE_V2;
}

export interface OnTopBreakdown {
  /** The vendor's price (what the vendor receives in full). */
  subtotal: number;
  /** The platform fee added on top (5% of subtotal). */
  platformFee: number;
  /** What the client pays = subtotal + platform fee. */
  clientTotal: number;
  /** The vendor payout = the full subtotal (the vendor is always made whole). */
  vendorPayout: number;
  /** The fee rate applied (e.g. 0.05). */
  feeRate: number;
}

/** Round to cents (kept identical to the server rounding). */
function cents(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * On-top breakdown for a vendor SUBTOTAL. Mirrors the server computeOnTopCharge:
 * the fee is added on top, the client total is subtotal + fee, and the vendor
 * payout is the full subtotal.
 */
export function onTopBreakdown(subtotal: number): OnTopBreakdown {
  const base = Math.max(0, cents(subtotal));
  const rate = platformFeeRate();
  const platformFee = cents(base * rate);
  return {
    subtotal: base,
    platformFee,
    clientTotal: cents(base + platformFee),
    vendorPayout: base,
    feeRate: rate,
  };
}

/**
 * Decompose a GROSS client total (subtotal + fee already on top) back into its
 * parts. Used where a view only has the all-in total (e.g. an invoice balance).
 */
export function decomposeClientTotal(clientTotal: number): OnTopBreakdown {
  const total = Math.max(0, cents(clientTotal));
  const rate = platformFeeRate();
  const base = cents(total / (1 + rate));
  const platformFee = cents(total - base);
  return { subtotal: base, platformFee, clientTotal: total, vendorPayout: base, feeRate: rate };
}

/** Format a number as USD (display only). */
export function usd(n: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(n) || 0);
}

/** A short, human label for the fee line, e.g. "Platform fee (5%)". */
export function feeLineLabel(): string {
  return `Platform fee (${Math.round(platformFeeRate() * 100)}%)`;
}
