/**
 * Wave 5 - Vendor dashboard metrics. Mount base: /api/vendor-metrics.
 *
 * Read-only marketplace + revenue analytics scoped to the signed-in actor's
 * organization. No money-flow change. Mirrors server/src/routes/inventory.ts:
 * requireUser, getActor, a requireOrg helper, and the h() async wrapper. The
 * metrics helper degrades each aggregate to zero when its source table is absent.
 *
 *   GET /api/vendor-metrics/summary   leads + quotes + bookings + revenue +
 *                                     marketplace ranking for the caller's org
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { vendorMetrics } from "../db/metrics.js";

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

const router = Router();
router.use(requireUser);

// GET /api/vendor-metrics/summary
router.get(
  "/summary",
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const metrics = await vendorMetrics(orgId);
    res.json({ metrics });
  }),
);

export default router;
