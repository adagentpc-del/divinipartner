/**
 * Friction Elimination - vendor-compliance routes (U9 + U11). Mount base:
 * /api/vendor-compliance.
 *
 * A vendor's compliance signals + computed Vendor Compliance Score (0-100), plus
 * the Transparent Preferred Vendor "WHY" reasons surfaced on preferred-vendor
 * lists. Every route is org-scoped and IDOR-safe via the vendor-compliance repo
 * (server/src/db/vendor-compliance.ts), which validates the vendor against the
 * actor's org (vendors.organization_id) before any read or write. Mirrors
 * server/src/routes/preferred-vendors.ts and events.ts patterns: requireUser,
 * getActor, the h() async wrapper, 400 on bad input, 403/404 from repo errors.
 *
 * This file is ADDITIVE and does not edit the Phase-4
 * routes/preferred-vendors.ts. The integration lead mounts it in routes.ts.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as compliance from "../db/vendor-compliance.js";

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

/** Get a vendor's compliance score + breakdown + the WHY reasons. */
router.get(
  "/:vendorId",
  h(async (req, res) => {
    const a = await actor(req);
    const result = await compliance.getVendorCompliance(a, req.params.vendorId);
    res.json({
      vendor_id: req.params.vendorId,
      score: result.score,
      breakdown: result.breakdown,
      why: result.why,
      row: result.row,
    });
  }),
);

/**
 * Create or update a vendor's compliance signals (recomputes + stores the
 * score). Body fields are all optional; omitted fields keep their prior value.
 */
router.post(
  "/:vendorId",
  h(async (req, res) => {
    const a = await actor(req);
    const result = await compliance.upsertVendorCompliance(a, req.params.vendorId, req.body ?? {});
    res.status(201).json({
      vendor_id: req.params.vendorId,
      score: result.score,
      breakdown: result.breakdown,
      why: result.why,
      row: result.row,
    });
  }),
);

/** Recompute a vendor's compliance score from its currently-stored signals. */
router.post(
  "/:vendorId/recompute",
  h(async (req, res) => {
    const a = await actor(req);
    const score = await compliance.recomputeVendorCompliance(a, req.params.vendorId);
    res.json({ vendor_id: req.params.vendorId, score });
  }),
);

/** Just the Transparent Preferred Vendor "WHY" reasons for a vendor. */
router.get(
  "/:vendorId/why",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({
      vendor_id: req.params.vendorId,
      why: await compliance.getVendorWhy(a, req.params.vendorId),
    });
  }),
);

export default router;
