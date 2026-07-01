/**
 * Wave 5 - Venue dashboard metrics. Mount base: /api/venue-metrics.
 *
 * Read-only analytics over the venue revenue-share ledger, scoped to the signed
 * in actor's organization. No money-flow change. Mirrors server/src/routes/
 * inventory.ts: requireUser, getActor, a requireOrg helper, and the h() async
 * wrapper. Degrades to zeros when the ledger table is absent (the metrics helper
 * does the to_regclass check).
 *
 *   GET /api/venue-metrics/summary   bookings + GMV + revenue-share rollup for
 *                                    the caller's venue org
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { venueMetrics } from "../db/metrics.js";

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

// GET /api/venue-metrics/summary
router.get(
  "/summary",
  h(async (req, res) => {
    const orgId = await requireOrg(req, res);
    if (!orgId) return;
    const metrics = await venueMetrics(orgId);
    res.json({ metrics });
  }),
);

export default router;
