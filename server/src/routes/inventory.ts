/**
 * Phase 4 - Inventory routes. Mounted at /api/inventory.
 *
 * Org-scoped rental inventory CRUD, availability windows, and the blueprint 12.3
 * filterable search. Every handler resolves the signed-in actor's organization
 * and constrains all reads/writes to it.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as inv from "../db/inventory.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** Resolve the actor's org id or send 400 if they have no organization yet. */
async function requireOrg(req: Request, res: Response): Promise<string | null> {
  const auth = getAuth(req);
  const actor = await db.getActor(auth.userId!, auth.email);
  if (!actor.org) {
    res.status(400).json({ error: "no organization for this account" });
    return null;
  }
  return actor.org.id;
}

function parseFilters(query: Request["query"]): inv.InventorySearchFilters {
  const s = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : undefined);
  const n = (k: string) => {
    const v = s(k);
    return v != null && v !== "" ? Number(v) : undefined;
  };
  const b = (k: string) => {
    const v = s(k);
    if (v === "true") return true;
    if (v === "false") return false;
    return undefined;
  };
  return {
    search: s("search"),
    category: s("category"),
    minPrice: n("minPrice"),
    maxPrice: n("maxPrice"),
    priceUnit: s("priceUnit"),
    warehouseLocation: s("warehouseLocation"),
    maxLeadTime: s("maxLeadTime"),
    laborRequired: b("laborRequired"),
    contractEligible: b("contractEligible"),
    status: s("status"),
    availableFrom: s("availableFrom"),
    minQuantity: n("minQuantity"),
  };
}

const router = Router();

// GET /api/inventory - list + filter (blueprint 12.3)
router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const items = await inv.listInventory(orgId, parseFilters(req.query));
    res.json({ items });
  }),
);

// GET /api/inventory/:id - single item
router.get(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const item = await inv.getInventoryItem(orgId, req.params.id);
    if (!item) return res.status(404).json({ error: "not found" });
    res.json({ item });
  }),
);

// POST /api/inventory - create
router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const item = await inv.createInventoryItem(orgId, req.body ?? {});
    res.status(201).json({ item });
  }),
);

// PUT /api/inventory/:id - update
router.put(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const item = await inv.updateInventoryItem(orgId, req.params.id, req.body ?? {});
    res.json({ item });
  }),
);

// DELETE /api/inventory/:id - remove
router.delete(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const ok = await inv.deleteInventoryItem(orgId, req.params.id);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  }),
);

// GET /api/inventory/:id/availability - list availability windows
router.get(
  "/:id/availability",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const windows = await inv.listAvailability(orgId, req.params.id);
    res.json({ availability: windows });
  }),
);

// POST /api/inventory/:id/availability - add an availability window
router.post(
  "/:id/availability",
  requireUser,
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    if (!req.body?.start_date) {
      return res.status(400).json({ error: "start_date required" });
    }
    const window = await inv.addAvailability(orgId, req.params.id, req.body);
    res.status(201).json({ availability: window });
  }),
);

export default router;
