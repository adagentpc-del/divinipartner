/**
 * Divini Price Guide (docs/DIVINI_DETERMINISTIC_TOOLS_SPEC.md, build-order
 * slice 6). Calculates a profitable pricing range from a real entered cost
 * and a target margin -- pure arithmetic (`price = cost / (1 - margin)`),
 * never a generated or "recommended" number (spec constraint 6/7: never
 * fabricate a business recommendation, never make a binding pricing
 * decision for the user). Every computed price is shown with the formula
 * that produced it (spec constraint 8).
 *
 * More useful once Divini Profit Map (slice 5) has real cost/margin
 * history: this module surfaces the org's actual average achieved margin
 * as reference context alongside the calculator, per the spec's own
 * build-order rationale -- never as a suggestion, only as a real fact to
 * weigh when picking a target margin.
 */
import { q, q1 } from "../pool.js";
import { NotFoundError, ForbiddenError, type Actor } from "../db.js";
import { isPlusTier, featureLockedPayload } from "../lib/entitlements.js";
import { getProfitMapReport } from "./profitMap.js";

export class FeatureLockedError extends Error {
  status = 403;
  payload: ReturnType<typeof featureLockedPayload>;
  constructor(actor: Actor) {
    super("Divini Price Guide is a Plus feature");
    this.name = "FeatureLockedError";
    this.payload = featureLockedPayload(actor.org ?? { tier: null, type: null }, "Divini Price Guide", "partner");
  }
}

function requirePlus(actor: Actor): void {
  if (!actor.org || !isPlusTier(actor.org)) throw new FeatureLockedError(actor);
}

function assertOrgAccess(actor: Actor): string {
  if (!actor.org) throw new ForbiddenError("register an organization first");
  return actor.org.id;
}

export type PriceGuideItemRow = {
  id: string;
  organization_id: string;
  name: string;
  category: string | null;
  typical_cost: string;
  target_margin_pct: string;
  floor_margin_pct: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PricedItem = PriceGuideItemRow & {
  target_price: number;
  floor_price: number | null;
};

/** price = cost / (1 - margin). Undefined (never fabricated as 0 or the
 *  cost itself) when margin is 1 or more, which the schema already forbids. */
function priceForMargin(cost: number, marginPct: number): number {
  return cost / (1 - marginPct);
}

function withPrices(row: PriceGuideItemRow): PricedItem {
  const cost = Number(row.typical_cost);
  const target = Number(row.target_margin_pct);
  const floor = row.floor_margin_pct != null ? Number(row.floor_margin_pct) : null;
  return {
    ...row,
    target_price: priceForMargin(cost, target),
    floor_price: floor != null ? priceForMargin(cost, floor) : null,
  };
}

export async function listItems(actor: Actor): Promise<PricedItem[]> {
  requirePlus(actor);
  const orgId = assertOrgAccess(actor);
  const rows = await q<PriceGuideItemRow>(
    `select * from price_guide_items where organization_id = $1 order by created_at desc limit 500`,
    [orgId],
  );
  return rows.map(withPrices);
}

async function assertItemAccess(actor: Actor, id: string): Promise<PriceGuideItemRow> {
  const orgId = assertOrgAccess(actor);
  const row = await q1<PriceGuideItemRow>(`select * from price_guide_items where id = $1 and organization_id = $2`, [id, orgId]);
  if (!row) throw new NotFoundError("pricing item not found");
  return row;
}

export type ItemInput = {
  name: string;
  category?: string | null;
  typical_cost: number;
  target_margin_pct: number;
  floor_margin_pct?: number | null;
  notes?: string | null;
};

function badInput(message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number };
  err.status = 400;
  return err;
}

function validateInput(input: ItemInput): void {
  if (!input.name?.trim()) throw badInput("name is required");
  if (!Number.isFinite(input.typical_cost) || input.typical_cost < 0) throw badInput("typical_cost must be a non-negative number");
  if (!Number.isFinite(input.target_margin_pct) || input.target_margin_pct < 0 || input.target_margin_pct >= 1) {
    throw badInput("target_margin_pct must be between 0 and 1 (e.g. 0.3 for 30%)");
  }
  if (input.floor_margin_pct != null && (!Number.isFinite(input.floor_margin_pct) || input.floor_margin_pct < 0 || input.floor_margin_pct >= 1)) {
    throw badInput("floor_margin_pct must be between 0 and 1 (e.g. 0.15 for 15%)");
  }
}

export async function createItem(actor: Actor, input: ItemInput): Promise<PricedItem> {
  requirePlus(actor);
  const orgId = assertOrgAccess(actor);
  validateInput(input);
  const row = (await q1<PriceGuideItemRow>(
    `insert into price_guide_items (organization_id, name, category, typical_cost, target_margin_pct, floor_margin_pct, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [
      orgId,
      input.name.trim(),
      input.category?.trim() || null,
      input.typical_cost,
      input.target_margin_pct,
      input.floor_margin_pct ?? null,
      input.notes ?? null,
      actor.user.id,
    ],
  )) as PriceGuideItemRow;
  return withPrices(row);
}

export async function updateItem(actor: Actor, id: string, patch: Partial<ItemInput>): Promise<PricedItem> {
  requirePlus(actor);
  const existing = await assertItemAccess(actor, id);
  const orgId = assertOrgAccess(actor);
  const merged: ItemInput = {
    name: patch.name ?? existing.name,
    category: patch.category !== undefined ? patch.category : existing.category,
    typical_cost: patch.typical_cost ?? Number(existing.typical_cost),
    target_margin_pct: patch.target_margin_pct ?? Number(existing.target_margin_pct),
    floor_margin_pct: patch.floor_margin_pct !== undefined ? patch.floor_margin_pct : existing.floor_margin_pct != null ? Number(existing.floor_margin_pct) : null,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
  };
  validateInput(merged);
  const row = (await q1<PriceGuideItemRow>(
    `update price_guide_items set
       name = $3, category = $4, typical_cost = $5, target_margin_pct = $6,
       floor_margin_pct = $7, notes = $8, updated_at = now()
     where id = $1 and organization_id = $2
     returning *`,
    [id, orgId, merged.name.trim(), merged.category?.trim() || null, merged.typical_cost, merged.target_margin_pct, merged.floor_margin_pct ?? null, merged.notes ?? null],
  )) as PriceGuideItemRow;
  return withPrices(row);
}

export async function deleteItem(actor: Actor, id: string): Promise<void> {
  requirePlus(actor);
  const orgId = assertOrgAccess(actor);
  await assertItemAccess(actor, id);
  await q(`delete from price_guide_items where id = $1 and organization_id = $2`, [id, orgId]);
}

export type PriceGuideContext = {
  costedJobCount: number;
  averageMarginPct: number | null;
};

/** Real historical context from Divini Profit Map -- an org-wide average,
 *  never a per-item match (spec constraint 6: no fabricated pattern
 *  matching pretending to be smarter than the data). */
export async function getContext(actor: Actor): Promise<PriceGuideContext> {
  requirePlus(actor);
  const report = await getProfitMapReport(actor, 12);
  return {
    costedJobCount: report.costRecordedCount,
    averageMarginPct: report.marginPct,
  };
}
