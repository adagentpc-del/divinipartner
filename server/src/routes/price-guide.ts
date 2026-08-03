/**
 * Divini Price Guide. Mounted at /api/price-guide.
 *
 *   GET    /items          list pricing items, each with computed target/floor price
 *   POST   /items          create { name, category?, typical_cost, target_margin_pct, floor_margin_pct?, notes? }
 *   PATCH  /items/:id      update any subset of the same fields
 *   DELETE /items/:id      delete
 *   GET    /context        real historical context from Divini Profit Map (org-wide average margin)
 *
 * Every route is Plus-gated (403 feature_locked below Plus, per spec
 * section 18) via lib/entitlements.ts's isPlusTier -- see db/priceGuide.ts
 * for the calculation + gating logic itself.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as priceGuide from "../db/priceGuide.js";
import { FeatureLockedError } from "../db/priceGuide.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err: unknown) => {
      if (err instanceof FeatureLockedError) {
        res.status(403).json(err.payload);
        return;
      }
      if (err instanceof Error && "status" in err && typeof (err as { status: unknown }).status === "number") {
        res.status((err as Error & { status: number }).status).json({ error: err.message });
        return;
      }
      next(err);
    });

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

router.get(
  "/items",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ items: await priceGuide.listItems(a) });
  }),
);

router.post(
  "/items",
  h(async (req, res) => {
    const a = await actor(req);
    const item = await priceGuide.createItem(a, req.body ?? {});
    res.status(201).json({ item });
  }),
);

router.patch(
  "/items/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const item = await priceGuide.updateItem(a, req.params.id, req.body ?? {});
    res.json({ item });
  }),
);

router.delete(
  "/items/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await priceGuide.deleteItem(a, req.params.id);
    res.status(204).end();
  }),
);

router.get(
  "/context",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ context: await priceGuide.getContext(a) });
  }),
);

export default router;
