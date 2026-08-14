/**
 * Supplier warehouse routes. Mounted at /api/warehouses.
 *
 * Free/Plus are capped at 1 warehouse; Pro is unlimited ("Multi warehouse" --
 * see lib/planCatalog.ts). Enforced server-side via checkLimit on create,
 * same 402 plan_limit_reached shape every other checkLimit-gated route uses.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as wh from "../db/warehouses.js";
import { checkLimit, limitExceededPayload } from "../lib/entitlements.js";

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

const router = Router();

router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const org = await requireOrgRow(req, res);
    if (!org) return;
    res.json({ warehouses: await wh.listWarehouses(org.id) });
  }),
);

router.post(
  "/",
  requireUser,
  h(async (req, res) => {
    const org = await requireOrgRow(req, res);
    if (!org) return;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name) return res.status(400).json({ error: "name is required" });

    const used = await wh.countWarehouses(org.id);
    const check = checkLimit(org, "warehouses", used);
    if (!check.allowed) {
      return res.status(402).json(limitExceededPayload(org, "warehouses", check));
    }

    const address = typeof req.body?.address === "string" ? req.body.address : null;
    const warehouse = await wh.createWarehouse(org.id, { name, address });
    res.status(201).json({ warehouse });
  }),
);

router.put(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const org = await requireOrgRow(req, res);
    if (!org) return;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : undefined;
    const address = typeof req.body?.address === "string" ? req.body.address : undefined;
    const warehouse = await wh.updateWarehouse(org.id, req.params.id, { name, address });
    if (!warehouse) return res.status(404).json({ error: "not found" });
    res.json({ warehouse });
  }),
);

router.delete(
  "/:id",
  requireUser,
  h(async (req, res) => {
    const org = await requireOrgRow(req, res);
    if (!org) return;
    const ok = await wh.deleteWarehouse(org.id, req.params.id);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.status(204).end();
  }),
);

export default router;
