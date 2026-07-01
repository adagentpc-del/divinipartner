/**
 * Phase 4 - Vendor Pricing Memory data-access (blueprint 18).
 *
 * A per-vendor private "pricing brain": standard rates, product prices, rental
 * rates, labor rates, minimums, travel fees, discount rules, package templates,
 * rush multipliers, seasonal pricing, contract pricing, and a log of past quotes
 * and their outcomes. One row per organization (the vendor account), private to
 * that org and used by the auto-quote engine.
 */
import { q1 } from "../pool.js";

export type PricingMemory = {
  id?: string;
  organization_id?: string;
  standard_rates?: Record<string, unknown> | null;
  product_prices?: Record<string, unknown> | null;
  rental_rates?: Record<string, unknown> | null;
  labor_rates?: Record<string, unknown> | null;
  minimums?: Record<string, unknown> | null;
  travel_fees?: Record<string, unknown> | null;
  discount_rules?: unknown[] | null;
  package_templates?: unknown[] | null;
  rush_multipliers?: Record<string, unknown> | null;
  seasonal_pricing?: unknown[] | null;
  contract_pricing?: Record<string, unknown> | null;
  past_quotes?: unknown[] | null;
  notes?: string | null;
};

const COLS = `
  id, organization_id, standard_rates, product_prices, rental_rates,
  labor_rates, minimums, travel_fees, discount_rules, package_templates,
  rush_multipliers, seasonal_pricing, contract_pricing, past_quotes, notes,
  created_at, updated_at
`;

const JSON_FIELDS = [
  "standard_rates", "product_prices", "rental_rates", "labor_rates",
  "minimums", "travel_fees", "discount_rules", "package_templates",
  "rush_multipliers", "seasonal_pricing", "contract_pricing", "past_quotes",
] as const;

/** Reasonable defaults so the auto-quote engine always has something to work with. */
export function defaultPricingMemory(): PricingMemory {
  return {
    standard_rates: {},
    product_prices: {},
    rental_rates: {},
    labor_rates: { default: 65 },
    minimums: { order_minimum: 0, labor_minimum_hours: 0 },
    travel_fees: { base: 0, per_mile: 0, free_radius_miles: 0 },
    discount_rules: [],
    package_templates: [],
    rush_multipliers: { standard: 1, rush: 1.25, same_day: 1.5 },
    seasonal_pricing: [],
    contract_pricing: {},
    past_quotes: [],
    notes: null,
  };
}

/** Fetch the org's pricing memory (or null if never created). */
export async function getPricingMemory(orgId: string): Promise<PricingMemory | null> {
  return q1<PricingMemory>(
    `select ${COLS} from vendor_pricing_memory where organization_id = $1`,
    [orgId],
  );
}

/** Fetch the org's pricing memory, falling back to defaults (never null). */
export async function getPricingMemoryOrDefault(orgId: string): Promise<PricingMemory> {
  const existing = await getPricingMemory(orgId);
  if (existing) return existing;
  return { organization_id: orgId, ...defaultPricingMemory() };
}

/**
 * Upsert the org's pricing memory. Only the provided fields are written; missing
 * fields are left untouched on update (or default on first insert).
 */
export async function upsertPricingMemory(
  orgId: string,
  input: PricingMemory,
): Promise<PricingMemory> {
  const base = defaultPricingMemory();
  const merged: PricingMemory = { ...base, ...input };

  const jsonParam = (key: (typeof JSON_FIELDS)[number]) => {
    const value = (merged as Record<string, unknown>)[key];
    return value == null ? null : JSON.stringify(value);
  };

  const row = await q1<PricingMemory>(
    `insert into vendor_pricing_memory (
       organization_id, standard_rates, product_prices, rental_rates, labor_rates,
       minimums, travel_fees, discount_rules, package_templates, rush_multipliers,
       seasonal_pricing, contract_pricing, past_quotes, notes, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
     on conflict (organization_id) do update set
       standard_rates = coalesce(excluded.standard_rates, vendor_pricing_memory.standard_rates),
       product_prices = coalesce(excluded.product_prices, vendor_pricing_memory.product_prices),
       rental_rates = coalesce(excluded.rental_rates, vendor_pricing_memory.rental_rates),
       labor_rates = coalesce(excluded.labor_rates, vendor_pricing_memory.labor_rates),
       minimums = coalesce(excluded.minimums, vendor_pricing_memory.minimums),
       travel_fees = coalesce(excluded.travel_fees, vendor_pricing_memory.travel_fees),
       discount_rules = coalesce(excluded.discount_rules, vendor_pricing_memory.discount_rules),
       package_templates = coalesce(excluded.package_templates, vendor_pricing_memory.package_templates),
       rush_multipliers = coalesce(excluded.rush_multipliers, vendor_pricing_memory.rush_multipliers),
       seasonal_pricing = coalesce(excluded.seasonal_pricing, vendor_pricing_memory.seasonal_pricing),
       contract_pricing = coalesce(excluded.contract_pricing, vendor_pricing_memory.contract_pricing),
       past_quotes = coalesce(excluded.past_quotes, vendor_pricing_memory.past_quotes),
       notes = coalesce(excluded.notes, vendor_pricing_memory.notes),
       updated_at = now()
     returning ${COLS}`,
    [
      orgId,
      jsonParam("standard_rates"), jsonParam("product_prices"), jsonParam("rental_rates"),
      jsonParam("labor_rates"), jsonParam("minimums"), jsonParam("travel_fees"),
      jsonParam("discount_rules"), jsonParam("package_templates"), jsonParam("rush_multipliers"),
      jsonParam("seasonal_pricing"), jsonParam("contract_pricing"), jsonParam("past_quotes"),
      merged.notes ?? null,
    ],
  );
  return row as PricingMemory;
}

/** Append a past quote + outcome to the pricing memory log. */
export async function recordPastQuote(
  orgId: string,
  entry: { quote_id?: string; event_type?: string; total?: number; outcome?: string },
): Promise<void> {
  const mem = await getPricingMemoryOrDefault(orgId);
  const log = Array.isArray(mem.past_quotes) ? mem.past_quotes.slice() : [];
  log.push({ ...entry, at: new Date().toISOString() });
  await upsertPricingMemory(orgId, { past_quotes: log });
}
