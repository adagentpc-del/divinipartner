/**
 * Phase 4 - Deterministic Auto-Quote engine (blueprint 17 + 18).
 *
 * Given an event (and optionally a specific bid) plus the vendor's inventory and
 * pricing memory, this produces a draft quote in the standardized Divini format.
 * There is NO external AI or randomness: every output is a pure function of the
 * inputs, so the same inputs always yield the same draft.
 *
 * The two entry points:
 *   - generateAutoQuote(ctx): builds the draft (line items, labor, fees, total).
 *   - quoteIntelligence(ctx, draft): advisory flags computed from the same data.
 */

import type { PricingMemory } from "../db/pricing-memory.js";
import { PRICING_V2, PLATFORM_FEE_RATE_V2 } from "../config.js";

// ---------------------------------------------------------------------------
// Input shapes (the route assembles these from the DB).
// ---------------------------------------------------------------------------

export type AutoQuoteEvent = {
  id?: string;
  name?: string;
  type?: string | null;
  guest_count?: number | null;
  budget?: number | null;
  date_time?: string | null;
  required_services?: string[] | null;
};

export type AutoQuoteBid = {
  id?: string;
  category?: string | null;
  scope?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  deadline?: string | null;
  rush?: boolean | null;
};

export type AutoQuoteInventoryItem = {
  id?: string;
  name?: string;
  category?: string | null;
  price?: number | null;
  price_unit?: string | null;
  quantity?: number | null;
  delivery_fee?: number | null;
  install_fee?: number | null;
  labor_required?: boolean | null;
  labor_hours?: number | null;
  service_radius?: number | null;
  add_ons?: unknown;
  contract_pricing_eligible?: boolean | null;
};

export type AutoQuoteContext = {
  event: AutoQuoteEvent;
  bid?: AutoQuoteBid | null;
  inventory: AutoQuoteInventoryItem[];
  pricing: PricingMemory;
  /** Platform fee rate (decimal, e.g. 0.025) from the org tier. */
  platformFeeRate: number;
  /** Optional contract-pricing discount to apply (decimal, e.g. 0.10). */
  contractDiscountRate?: number;
};

export type QuoteLineItem = {
  inventory_item_id?: string;
  name: string;
  category?: string | null;
  quantity: number;
  unit_price: number;
  unit: string;
  line_total: number;
  note?: string;
};

export type AutoQuoteDraft = {
  currency: "USD";
  format: "divini.standard.v1";
  event_id?: string;
  bid_id?: string;
  recommended_items: QuoteLineItem[];
  labor: { hours: number; rate: number; total: number };
  fees: {
    delivery: number;
    install: number;
    rush: number;
    travel: number;
    rush_multiplier: number;
  };
  add_ons: { name: string; price: number }[];
  exclusions: string[];
  subtotal: number;       // items + labor, before fees + discounts
  discount: number;       // contract / volume discount applied
  fees_total: number;     // delivery + install + rush + travel
  platform_fee: number;   // platform fee on the post-discount subtotal + fees
  total: number;          // suggested grand total
  expiration_date: string;
  generated_at: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Recommended quantity for an item given the event. We size to guest count when
 * a category implies per-guest scaling (seating, place settings), otherwise we
 * suggest one unit (capped by on-hand quantity when known).
 */
function recommendedQuantity(item: AutoQuoteInventoryItem, guestCount: number): number {
  const cat = (item.category ?? "").toLowerCase();
  const perGuest = /(chair|seat|setting|linen|napkin|glass|plate|charger|cutlery|flatware)/.test(cat);
  let qty = perGuest && guestCount > 0 ? guestCount : 1;
  if (typeof item.quantity === "number" && item.quantity > 0) {
    qty = Math.min(qty, item.quantity);
  }
  return Math.max(1, qty);
}

/** Pick the labor hourly rate from pricing memory (default fallback). */
function laborRate(pricing: PricingMemory): number {
  const rates = (pricing.labor_rates ?? {}) as Record<string, unknown>;
  return num(rates.default ?? rates.standard, 65);
}

/** Resolve the rush multiplier from pricing memory + bid/rush flag. */
function rushMultiplier(pricing: PricingMemory, bid?: AutoQuoteBid | null): number {
  const m = (pricing.rush_multipliers ?? {}) as Record<string, unknown>;
  if (bid?.rush) return num(m.rush ?? m.same_day, 1.25);
  return num(m.standard, 1);
}

/** Compute volume discount from discount_rules given a subtotal. */
function volumeDiscount(pricing: PricingMemory, subtotal: number): number {
  const rules = Array.isArray(pricing.discount_rules) ? pricing.discount_rules : [];
  let best = 0;
  for (const r of rules as Array<Record<string, unknown>>) {
    const threshold = num(r.threshold, Infinity);
    const pct = num(r.pct, 0);
    if (subtotal >= threshold && pct > best) best = pct;
  }
  return best; // decimal, e.g. 0.10
}

/** Match relevant inventory to the bid category / required services. */
function selectInventory(ctx: AutoQuoteContext): AutoQuoteInventoryItem[] {
  const wantCat = (ctx.bid?.category ?? "").toLowerCase();
  const required = (ctx.event.required_services ?? []).map((s) => s.toLowerCase());
  const matches = ctx.inventory.filter((it) => {
    const cat = (it.category ?? "").toLowerCase();
    if (wantCat && cat.includes(wantCat)) return true;
    if (required.some((r) => cat.includes(r) || (it.name ?? "").toLowerCase().includes(r))) return true;
    return false;
  });
  // If nothing matched the filters, recommend the full catalogue so the vendor
  // still gets a usable starting draft rather than an empty quote.
  return matches.length > 0 ? matches : ctx.inventory;
}

// ---------------------------------------------------------------------------
// Auto-quote generation
// ---------------------------------------------------------------------------

export function generateAutoQuote(ctx: AutoQuoteContext): AutoQuoteDraft {
  const guests = num(ctx.event.guest_count, 0);
  const chosen = selectInventory(ctx);

  const recommended_items: QuoteLineItem[] = chosen.map((it) => {
    const qty = recommendedQuantity(it, guests);
    const unitPrice = num(it.price, 0);
    return {
      inventory_item_id: it.id,
      name: it.name ?? "Item",
      category: it.category ?? null,
      quantity: qty,
      unit_price: round2(unitPrice),
      unit: it.price_unit ?? "per_unit",
      line_total: round2(unitPrice * qty),
    };
  });

  const itemsTotal = round2(recommended_items.reduce((s, li) => s + li.line_total, 0));

  // Labor: sum estimated hours across items that require it.
  const rate = laborRate(ctx.pricing);
  const minHours = num((ctx.pricing.minimums as Record<string, unknown> | undefined)?.labor_minimum_hours, 0);
  let laborHours = 0;
  for (const it of chosen) {
    if (it.labor_required) {
      const perUnit = num(it.labor_hours, 1);
      const qty = recommendedQuantity(it, guests);
      laborHours += perUnit * qty;
    }
  }
  laborHours = Math.max(laborHours, laborHours > 0 ? minHours : 0);
  const laborTotal = round2(laborHours * rate);

  // Fees.
  const delivery = round2(chosen.reduce((s, it) => s + num(it.delivery_fee, 0), 0));
  const install = round2(chosen.reduce((s, it) => s + num(it.install_fee, 0), 0));
  const travelCfg = (ctx.pricing.travel_fees ?? {}) as Record<string, unknown>;
  const travel = round2(num(travelCfg.base, 0));

  const rushMult = rushMultiplier(ctx.pricing, ctx.bid);
  const preRushSubtotal = round2(itemsTotal + laborTotal);
  const rushFee = rushMult > 1 ? round2(preRushSubtotal * (rushMult - 1)) : 0;

  const subtotal = preRushSubtotal;

  // Discounts: the larger of contract discount or volume discount.
  const contractRate = num(ctx.contractDiscountRate, 0);
  const volRate = volumeDiscount(ctx.pricing, subtotal);
  const discountRate = Math.max(contractRate, volRate);
  const discount = round2(subtotal * discountRate);

  const feesTotal = round2(delivery + install + rushFee + travel);
  const taxableBase = round2(subtotal - discount + feesTotal);
  // Pricing V2: flat 5% platform fee ADDED ON TOP of the taxable base (the
  // vendor's price). The vendor receives the full taxable base; the client
  // total = base + fee. Legacy: the tier rate the route passes in (unchanged).
  const effectiveFeeRate = PRICING_V2 ? PLATFORM_FEE_RATE_V2 : num(ctx.platformFeeRate, 0);
  const platformFee = round2(taxableBase * effectiveFeeRate);
  const total = round2(taxableBase + platformFee);

  // Add-ons: surface item add-ons as optional extras.
  const add_ons: { name: string; price: number }[] = [];
  for (const it of chosen) {
    if (Array.isArray(it.add_ons)) {
      for (const a of it.add_ons as Array<Record<string, unknown>>) {
        if (a && typeof a.name === "string") {
          add_ons.push({ name: a.name, price: round2(num(a.price, 0)) });
        }
      }
    }
  }

  const exclusions = [
    "Permits and venue-imposed fees unless stated",
    "Overtime beyond the quoted labor hours",
    "Damage or loss beyond normal wear (damage deposit applies)",
  ];

  return {
    currency: "USD",
    format: "divini.standard.v1",
    event_id: ctx.event.id,
    bid_id: ctx.bid?.id,
    recommended_items,
    labor: { hours: round2(laborHours), rate: round2(rate), total: laborTotal },
    fees: { delivery, install, rush: rushFee, travel, rush_multiplier: rushMult },
    add_ons,
    exclusions,
    subtotal,
    discount,
    fees_total: feesTotal,
    platform_fee: platformFee,
    total,
    expiration_date: defaultExpiration(ctx),
    generated_at: new Date().toISOString(),
  };
}

/** Quote valid for 14 days, but never past the bid deadline. */
function defaultExpiration(ctx: AutoQuoteContext): string {
  const fourteen = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const deadline = ctx.bid?.deadline ? new Date(ctx.bid.deadline) : null;
  if (deadline && !Number.isNaN(deadline.getTime()) && deadline < fourteen) {
    return deadline.toISOString();
  }
  return fourteen.toISOString();
}

// ---------------------------------------------------------------------------
// Quote intelligence (advisory flags)
// ---------------------------------------------------------------------------

export type QuoteFlag = {
  level: "info" | "warning" | "opportunity";
  code: string;
  message: string;
};

export function quoteIntelligence(
  ctx: AutoQuoteContext,
  draft: AutoQuoteDraft,
): QuoteFlag[] {
  const flags: QuoteFlag[] = [];

  // Missing fees.
  if (draft.fees.delivery === 0 && draft.recommended_items.length > 0) {
    flags.push({
      level: "warning",
      code: "missing_delivery_fee",
      message: "No delivery fee is set on the recommended items. Add one if delivery applies.",
    });
  }
  if (draft.fees.install === 0 && ctx.inventory.some((i) => i.labor_required)) {
    flags.push({
      level: "warning",
      code: "missing_install_fee",
      message: "Items require labor but no install fee is set. Confirm install is covered by labor.",
    });
  }

  // Deadline pressure.
  if (ctx.bid?.deadline) {
    const ms = new Date(ctx.bid.deadline).getTime() - Date.now();
    if (Number.isFinite(ms) && ms > 0) {
      const hours = Math.round(ms / (60 * 60 * 1000));
      if (hours <= 48) {
        flags.push({
          level: "warning",
          code: "closing_soon",
          message: `This bid closes in about ${hours} hour${hours === 1 ? "" : "s"}. Submit promptly.`,
        });
      }
    } else if (Number.isFinite(ms) && ms <= 0) {
      flags.push({
        level: "warning",
        code: "deadline_passed",
        message: "The bid deadline has passed. Confirm the request is still open before submitting.",
      });
    }
  }

  // Budget fit -> competitiveness.
  const budgetMax = num(ctx.bid?.budget_max, num(ctx.event.budget, 0));
  if (budgetMax > 0) {
    if (draft.total <= budgetMax) {
      flags.push({
        level: "opportunity",
        code: "within_budget",
        message: "The suggested total is within the stated budget, so this quote is likely competitive.",
      });
    } else {
      const over = Math.round(((draft.total - budgetMax) / budgetMax) * 100);
      flags.push({
        level: "warning",
        code: "over_budget",
        message: `The suggested total is about ${over}% over the stated budget. Consider trimming line items.`,
      });
    }
  }

  // Contract / preferred pricing opportunity.
  if (ctx.inventory.some((i) => i.contract_pricing_eligible) && num(ctx.contractDiscountRate, 0) === 0) {
    flags.push({
      level: "opportunity",
      code: "contract_pricing_available",
      message: "Some items are contract-pricing eligible. Apply a partner discount to stay preferred.",
    });
  }

  // Empty draft.
  if (draft.recommended_items.length === 0) {
    flags.push({
      level: "info",
      code: "no_inventory_match",
      message: "No inventory matched this request. Add rental items or adjust your catalogue.",
    });
  }

  // Historical signal from past quotes.
  const past = Array.isArray(ctx.pricing.past_quotes) ? ctx.pricing.past_quotes : [];
  const won = (past as Array<Record<string, unknown>>).filter((p) => p.outcome === "accepted").length;
  if (past.length >= 3) {
    const winRate = Math.round((won / past.length) * 100);
    flags.push({
      level: "info",
      code: "historical_win_rate",
      message: `Your win rate on past quotes is about ${winRate}% across ${past.length} quotes.`,
    });
  }

  return flags;
}

export default generateAutoQuote;
