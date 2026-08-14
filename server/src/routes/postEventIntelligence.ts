/**
 * Vendor Event Performance + Post-Event Intelligence Digest routes
 * (live-ops phase, Part 32-38). Mount base: /api/post-event.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { listVendorEventPerformance } from "../db/vendorEventPerformance.js";
import { buildPostEventDigest } from "../db/postEventIntelligence.js";

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

router.get(
  "/event/:eventId/vendor-performance",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ vendors: await listVendorEventPerformance(a, req.params.eventId) });
  }),
);

router.get(
  "/event/:eventId/digest",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ digest: await buildPostEventDigest(a, req.params.eventId) });
  }),
);

export default router;
