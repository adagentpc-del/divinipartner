/**
 * Divini AI COO V2 - Marketplace Intelligence route.
 * Mount base: /api/marketplace-intel.
 *
 * GET /report - the ecosystem report: popular vendors/venues, growing
 * categories, trending event types, sponsor + inventory demand, regional
 * trends. The aggregation (server/src/db/market-intel.ts) returns
 * AGGREGATE-ONLY counts (no org ids, user ids, or money), so this is safe to
 * show every signed-in tenant - there is no per-tenant data in the payload to
 * leak. Computed live; degrades to empty arrays when the platform is empty.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireUser } from "../auth.js";
import { gatherMarketAggregates } from "../db/market-intel.js";
import { computeMarketIntel } from "../lib/marketplaceIntel.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();
router.use(requireUser);

router.get(
  "/report",
  h(async (_req, res) => {
    const aggregates = await gatherMarketAggregates();
    const report = computeMarketIntel(aggregates);
    res.json({ report });
  }),
);

export default router;
