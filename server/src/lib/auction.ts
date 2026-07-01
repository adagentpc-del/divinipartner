/**
 * Nonprofit Auction Management - deterministic helpers (Phase 2).
 *
 * Pure, side-effect-free helpers used by the auction repo + routes. No DB, no
 * network: validation of enum values, money coercion, image-url normalization,
 * and the current-high-bid computation. Keeping these here mirrors
 * server/src/lib/fundraising.ts and keeps the data layer thin + testable.
 */

// ---- Enums ------------------------------------------------------------------

export const AUCTION_ITEM_STATUSES = ["open", "closed", "awarded", "cancelled"] as const;
export type AuctionItemStatus = (typeof AUCTION_ITEM_STATUSES)[number];

export const AUCTION_PAYMENT_STATUSES = ["unpaid", "pending", "paid"] as const;
export type AuctionPaymentStatus = (typeof AUCTION_PAYMENT_STATUSES)[number];

export function isAuctionItemStatus(v: unknown): v is AuctionItemStatus {
  return typeof v === "string" && (AUCTION_ITEM_STATUSES as readonly string[]).includes(v);
}

export function isAuctionPaymentStatus(v: unknown): v is AuctionPaymentStatus {
  return typeof v === "string" && (AUCTION_PAYMENT_STATUSES as readonly string[]).includes(v);
}

// ---- Money + numeric coercion ----------------------------------------------

/** Coerce a numeric-ish value (string from pg numeric, number, null) to a number. */
export function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Parse a positive money amount from arbitrary input. Returns the number when it
 * is finite and strictly greater than zero, otherwise null. Used to validate bid
 * + winning-bid + checkout amounts.
 */
export function positiveAmount(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---- Image URLs -------------------------------------------------------------

/**
 * Normalize an image_urls input into a clean string array. Accepts an array of
 * strings, a single string, or null/undefined. Trims, drops empties, and caps
 * the count so a runaway payload cannot bloat the row.
 */
export function normalizeImageUrls(v: unknown): string[] {
  let arr: unknown[];
  if (Array.isArray(v)) arr = v;
  else if (typeof v === "string") arr = [v];
  else return [];
  const out: string[] = [];
  for (const item of arr) {
    if (typeof item !== "string") continue;
    const s = item.trim();
    if (s) out.push(s);
    if (out.length >= 24) break;
  }
  return out;
}

// ---- Bids -------------------------------------------------------------------

export type BidLike = { amount?: unknown };

/** The current high bid amount across an item's bids (0 when there are none). */
export function currentHighBid(bids: BidLike[]): number {
  let hi = 0;
  for (const b of bids) {
    const a = num(b.amount);
    if (a > hi) hi = a;
  }
  return hi;
}
