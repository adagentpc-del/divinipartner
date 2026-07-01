/**
 * Pricing V2 money math: PURE, dependency-free. No imports (no DB pool, no
 * config, no node modules). This is the single source of truth for the on-top
 * charge model and its inverse, extracted so it can be unit tested in isolation
 * and reused by db/payments.ts.
 *
 * Model (Pricing V2): the platform fee is ADDED ON TOP of the vendor subtotal.
 *   - The vendor is always made whole (receives the full subtotal).
 *   - The client is the only party whose total changes (subtotal + fee).
 *   - The venue receives a share of the platform fee (default 20 percent).
 *
 * All amounts are in major currency units (dollars) and rounded to cents.
 *
 * Zero em dashes.
 */

/** Round a number to cents (2 decimal places), guarding against tiny binary
 *  floating point drift by going through integer cents. */
function roundCents(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Given a vendor SUBTOTAL (what the vendor should receive), compute the platform
 * fee added on top, the client total, the vendor payout (the full subtotal), and
 * the venue share of the fee. Pure and additive: the vendor is always made whole.
 */
export function computeOnTopCharge(
  subtotal: number,
  rate = 0.05,
  venueFraction = 0.2,
): {
  subtotal: number;
  platformFee: number;
  clientTotal: number;
  vendorPayout: number;
  venueShare: number;
  feeRate: number;
} {
  const base = Math.max(0, roundCents(subtotal));
  const r = Number(rate) || 0;
  const platformFee = roundCents(base * r);
  const venueShare = venueShareOfFee(platformFee, venueFraction);
  return {
    subtotal: base,
    platformFee,
    clientTotal: roundCents(base + platformFee),
    vendorPayout: base,
    venueShare,
    feeRate: r,
  };
}

/**
 * Inverse of the on-top model. Given the GROSS client total (subtotal + fee),
 * decompose it back into its subtotal and platform fee so that:
 *     subtotal   = gross / (1 + rate)   (the vendor's quoted price)
 *     platformFee = gross - subtotal    (the fee that was added on top)
 *     netPayout  = subtotal             (the vendor is made whole)
 * No processing fee is carved out under V2.
 */
export function decomposeGrossOnTop(
  gross: number,
  rate = 0.05,
): {
  subtotal: number;
  platformFee: number;
  processingFee: number;
  netPayout: number;
} {
  const total = Math.max(0, roundCents(gross));
  const r = Number(rate) || 0;
  const subtotal = roundCents(total / (1 + r));
  const platformFee = roundCents(total - subtotal);
  return {
    subtotal,
    platformFee,
    processingFee: 0,
    netPayout: subtotal,
  };
}

/** The venue's share of a platform fee (default 20 percent), rounded to cents.
 *  Both arguments are in dollars; the fraction is clamped to [0, 1]. */
export function venueShareOfFee(feeCents: number, fraction = 0.2): number {
  const fee = Math.max(0, Number(feeCents) || 0);
  const frac = Math.min(1, Math.max(0, Number(fraction) || 0));
  return roundCents(fee * frac);
}
