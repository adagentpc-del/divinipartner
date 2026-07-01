/**
 * Venue Intelligence - vendor pricing-rule routes. Mount base: /api/vendor-pricing.
 *
 * The vendor Pricing Rules builder: an ordered list of conditional pricing steps
 * plus a base, which Phase 3's pricingEngine interprets (no eval) to compute a
 * draft quote price. Every route is org-scoped and IDOR-safe via the repo
 * (server/src/db/vendor-requirements.ts), which validates the vendor against the
 * actor's org before any read or write. Mirrors server/src/routes/venue-twin.ts
 * patterns: requireUser, getActor, the h() async wrapper, 400 on bad input,
 * 403/404 from the repo's ForbiddenError/NotFoundError.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as repo from "../db/vendor-requirements.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/** List a vendor's pricing-rule sets. */
router.get(
  "/vendor/:vendorId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ pricing_rules: await repo.listPricingRules(a, req.params.vendorId) });
  }),
);

/** Create a pricing-rule set for a vendor. */
router.post(
  "/vendor/:vendorId",
  h(async (req, res) => {
    const a = await actor(req);
    res
      .status(201)
      .json({ pricing_rule: await repo.createPricingRule(a, req.params.vendorId, req.body ?? {}) });
  }),
);

/** Get one pricing-rule set. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ pricing_rule: await repo.getPricingRule(a, req.params.id) });
  }),
);

/** Patch a pricing-rule set. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ pricing_rule: await repo.updatePricingRule(a, req.params.id, req.body ?? {}) });
  }),
);

/** Delete a pricing-rule set. */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await repo.deletePricingRule(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
