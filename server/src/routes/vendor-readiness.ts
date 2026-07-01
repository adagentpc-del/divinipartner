/**
 * Venue Intelligence - vendor-readiness routes. Mount base: /api/vendor-readiness.
 *
 * The Vendor Readiness Score (get current score + signals) and a recompute /
 * upsert endpoint. Every route is org-scoped and IDOR-safe via the
 * vendor-readiness repo (server/src/db/vendor-readiness.ts), which validates the
 * vendor against the actor's org before any read or write. Mirrors
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

/**
 * Resolve the vendor id owned by the signed-in actor's own organization, so a
 * logged-in vendor can load their own readiness score without knowing an id.
 * Returns { vendorId: string | null }; null when the actor has no vendor row.
 * IDOR-safe: only ever returns the actor's own org's vendor.
 */
router.get(
  "/mine",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ vendorId: await readiness.getMyVendorId(a) });
  }),
);

/** Get the Vendor Readiness Score + signal breakdown for a vendor. */
router.get(
  "/:vendorId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json(await readiness.getVendorReadiness(a, req.params.vendorId));
  }),
);

/**
 * Upsert readiness signals and recompute the score. Accepts any subset of the
 * signal fields; omitted fields keep their prior value. Returns the stored row,
 * the recomputed score, and the per-factor breakdown.
 */
router.post(
  "/:vendorId/recompute",
  h(async (req, res) => {
    const a = await actor(req);
    res.json(await readiness.upsertVendorReadiness(a, req.params.vendorId, req.body ?? {}));
  }),
);

export default router;
