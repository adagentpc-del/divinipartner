/**
 * Divini AI COO V2 - Pricing Intelligence route. Mount base: /api/pricing-intel.
 *
 * GET /recommendations - win rates + market rate bands + price/packaging
 * recommendations for the SIGNED-IN org's own quotes (private, org-scoped).
 * An admin may pass ?scope=ecosystem to see ecosystem-wide pricing. Everything
 * is computed live and deterministically; degrades gracefully when empty.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { gatherQuoteStats } from "../db/market-intel.js";
import { analyzePricing } from "../lib/pricingIntel.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<{ a: db.Actor; isAdmin: boolean }> {
  const auth = getAuth(req);
  return { a: await db.getActor(auth.userId!, auth.email), isAdmin: auth.isAdmin };
}

const router = Router();
router.use(requireUser);

router.get(
  "/recommendations",
  h(async (req, res) => {
    const { a, isAdmin } = await actor(req);
    // Admins may request the ecosystem-wide view; everyone else is org-scoped.
    const wantsEcosystem = isAdmin && req.query.scope === "ecosystem";
    const orgId = wantsEcosystem ? null : a.org?.id ?? null;
    // A non-admin with no org has no private data: return an empty analysis.
    if (!wantsEcosystem && !orgId) {
      const empty = analyzePricing({ byCategory: [], overall: { won: 0, lost: 0 } });
      return res.json({ scope: "org", analysis: empty });
    }
    const stats = await gatherQuoteStats(orgId);
    const analysis = analyzePricing(stats);
    res.json({ scope: wantsEcosystem ? "ecosystem" : "org", analysis });
  }),
);

export default router;
