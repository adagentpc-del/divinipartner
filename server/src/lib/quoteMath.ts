/**
 * Pure quote line-item math -- no DB, no config, matches the lib/pricingMath.ts
 * pattern so this stays independently unit-testable.
 *
 * Split out of db/quotes.ts (ALFY2 pack post-audit product pass, 2026-08-09)
 * after a live-discovered bug: computeSubtotal only recognized a `qty`
 * line-item field, but every real caller (AutoQuoteDraft.tsx, the production
 * vendor-quote UI; bids.ts's vendor-quote route) sends `quantity`. Every
 * vendor quote submitted through the actual product silently landed on
 * subtotal 0. A DB-importing module can't be unit-tested by this repo's pure-
 * module test convention, so the logic moved here.
 */
export type LineItem = {
  label?: string;
  name?: string;
  qty?: number;
  quantity?: number;
  unit_price?: number;
  amount?: number;
  line_total?: number;
  kind?: "service" | "add_on" | "exclusion" | "rental";
  note?: string;
};

/**
 * Sum of priced line items (amount, or quantity*unit_price). Accepts both
 * `quantity` (the field name every real caller actually sends) and `qty`
 * (kept for backward compatibility with any caller using the older field
 * name).
 */
export function computeSubtotal(items: LineItem[]): number {
  return items
    .filter((li) => li.kind !== "exclusion")
    .reduce((sum, li) => {
      if (typeof li.amount === "number") return sum + li.amount;
      const qty = typeof li.quantity === "number" ? li.quantity : li.qty;
      if (typeof qty === "number" && typeof li.unit_price === "number") {
        return sum + qty * li.unit_price;
      }
      return sum;
    }, 0);
}
