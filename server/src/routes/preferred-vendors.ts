/**
 * Venue Intelligence - preferred-vendors routes. Mount base: /api/preferred-vendors.
 *
 * A venue curating the vendors it trusts: list, set/update (with tier +
 * preloaded pricing), and remove. Every route is org-scoped and IDOR-safe via
 * the vendor-readiness repo (server/src/db/vendor-readiness.ts), which validates
 * the venue against the actor's org before any read or write. Mirrors
 * server/src/routes/venue-twin.ts patterns: requireUser, getActor, the h()
 * async wrapper, 400 on bad input, 403/404 from the repo errors.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as readiness from "../db/vendor-readiness.js";

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

/** List the vendors a venue has marked preferred. */
router.get(
  "/:venueId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ preferred: await readiness.listPreferredVendors(a, req.params.venueId) });
  }),
);

/** Mark (or update) a vendor as preferred for the venue. */
router.post(
  "/:venueId",
  h(async (req, res) => {
    const a = await actor(req);
    const { vendor_id, tier } = req.body ?? {};
    if (!vendor_id || typeof vendor_id !== "string") {
      return res.status(400).json({ error: "vendor_id required" });
    }
    if (!readiness.isPreferredTier(tier)) {
      return res.status(400).json({ error: "valid tier required" });
    }
    res.status(201).json({
      preferred: await readiness.setPreferredVendor(a, req.params.venueId, req.body),
    });
  }),
);

/** Remove a vendor from the venue's preferred list. */
router.delete(
  "/:venueId/:vendorId",
  h(async (req, res) => {
    const a = await actor(req);
    await readiness.removePreferredVendor(a, req.params.venueId, req.params.vendorId);
    res.status(204).end();
  }),
);

export default router;
