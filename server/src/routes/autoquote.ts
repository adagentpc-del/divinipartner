/**
 * Phase 4 - Auto-Quote routes. Mounted at /api/autoquote.
 *
 *   POST /api/autoquote/generate { bidId | eventId }
 *        -> draft quote (standardized Divini format) + intelligence flags,
 *           built from the actor's inventory + pricing memory.
 *   GET  /api/autoquote/pricing-memory  -> the org's pricing brain (or defaults).
 *   PUT  /api/autoquote/pricing-memory  -> upsert the org's pricing brain.
 *
 * The draft is NOT persisted here; it is returned for the vendor to edit in the
 * AutoQuoteDraft surface and submit through the existing quote flow.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { q1 } from "../pool.js";
import * as inv from "../db/inventory.js";
import * as pm from "../db/pricing-memory.js";
import {
  generateAutoQuote,
  quoteIntelligence,
  type AutoQuoteContext,
  type AutoQuoteEvent,
  type AutoQuoteBid,
} from "../lib/autoquote.js";
import { TIERS, type Tier } from "../db.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function requireOrgRow(req: Request, res: Response): Promise<db.DbOrg | null> {
  const auth = getAuth(req);
  const actor = await db.getActor(auth.userId!, auth.email);
  if (!actor.org) {
    res.status(400).json({ error: "no organization for this account" });
    return null;
  }
  return actor.org;
}

/** Platform fee rate from the org tier (falls back to stored rate, then 0). */
function platformFeeRate(org: db.DbOrg): number {
  const tier = org.tier as Tier | null;
  if (tier && (TIERS as Record<string, { feeRate: number }>)[tier]) {
    return TIERS[tier].feeRate;
  }
  const stored = Number(org.platform_fee_rate);
  return Number.isFinite(stored) ? stored : 0;
}

const router = Router();

// GET /api/autoquote/pricing-memory
router.get(
  "/pricing-memory",
  requireUser,
  h(async (req, res) => {
    const org = await requireOrgRow(req, res);
    if (!org) return;
    const memory = await pm.getPricingMemoryOrDefault(org.id);
    res.json({ pricing_memory: memory });
  }),
);

// PUT /api/autoquote/pricing-memory
router.put(
  "/pricing-memory",
  requireUser,
  h(async (req, res) => {
    const org = await requireOrgRow(req, res);
    if (!org) return;
    const memory = await pm.upsertPricingMemory(org.id, req.body ?? {});
    res.json({ pricing_memory: memory });
  }),
);

// POST /api/autoquote/generate
router.post(
  "/generate",
  requireUser,
  h(async (req, res) => {
    const org = await requireOrgRow(req, res);
    if (!org) return;

    const { bidId, eventId, contractDiscountRate } = req.body ?? {};
    if (!bidId && !eventId) {
      return res.status(400).json({ error: "bidId or eventId required" });
    }

    // Resolve the bid (optional) and the event it belongs to.
    let bid: AutoQuoteBid | null = null;
    let eventRow: AutoQuoteEvent | null = null;

    if (bidId) {
      const b = await q1<any>(
        `select id, event_id, category, scope, budget_min, budget_max, deadline, rush
           from bids where id = $1`,
        [bidId],
      );
      if (!b) return res.status(404).json({ error: "bid not found" });
      bid = {
        id: b.id,
        category: b.category,
        scope: b.scope,
        budget_min: b.budget_min != null ? Number(b.budget_min) : null,
        budget_max: b.budget_max != null ? Number(b.budget_max) : null,
        deadline: b.deadline ? new Date(b.deadline).toISOString() : null,
        rush: b.rush ?? false,
      };
      eventRow = await loadEvent(b.event_id);
    } else if (eventId) {
      eventRow = await loadEvent(eventId);
    }

    if (!eventRow) return res.status(404).json({ error: "event not found" });

    const inventory = (await inv.listInventory(org.id, { status: "active" })).map((it) => ({
      id: it.id,
      name: it.name,
      category: it.category,
      price: it.price != null ? Number(it.price) : null,
      price_unit: it.price_unit,
      quantity: it.quantity != null ? Number(it.quantity) : null,
      delivery_fee: it.delivery_fee != null ? Number(it.delivery_fee) : null,
      install_fee: it.install_fee != null ? Number(it.install_fee) : null,
      labor_required: it.labor_required,
      labor_hours: it.labor_hours != null ? Number(it.labor_hours) : null,
      service_radius: it.service_radius,
      add_ons: it.add_ons,
      contract_pricing_eligible: it.contract_pricing_eligible,
    }));

    const pricing = await pm.getPricingMemoryOrDefault(org.id);

    const ctx: AutoQuoteContext = {
      event: eventRow,
      bid,
      inventory,
      pricing,
      platformFeeRate: platformFeeRate(org),
      contractDiscountRate:
        contractDiscountRate != null ? Number(contractDiscountRate) : undefined,
    };

    const draft = generateAutoQuote(ctx);
    const flags = quoteIntelligence(ctx, draft);

    res.json({ draft, flags });
  }),
);

async function loadEvent(eventId: string): Promise<AutoQuoteEvent | null> {
  const e = await q1<any>(
    `select id, name, type, guest_count, budget, date_time, required_services
       from events where id = $1`,
    [eventId],
  );
  if (!e) return null;
  return {
    id: e.id,
    name: e.name,
    type: e.type,
    guest_count: e.guest_count != null ? Number(e.guest_count) : null,
    budget: e.budget != null ? Number(e.budget) : null,
    date_time: e.date_time ? new Date(e.date_time).toISOString() : null,
    required_services: Array.isArray(e.required_services) ? e.required_services : null,
  };
}

export default router;
