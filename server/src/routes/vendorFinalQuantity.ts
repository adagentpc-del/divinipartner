/**
 * Vendor Final Count / Final Quantity Workflow routes. Mount base:
 * /api/vendor-final-quantity.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as vfq from "../db/vendorFinalQuantity.js";

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

/** Submit (version) the caller's own vendor final quantity for a scope. */
router.post(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const { scope, quantity, unit, notes } = req.body ?? {};
    if (typeof quantity !== "number") return res.status(400).json({ error: "quantity required" });
    res
      .status(201)
      .json({ quantity: await vfq.submitVendorFinalQuantity(a, req.params.eventId, { scope, quantity, unit, notes }) });
  }),
);

/**
 * List vendor final quantities for an event. Owner/planner see every
 * vendor's submissions; any other actor sees only their own vendor's rows.
 * Optional ?vendorId= and ?scope= filters (vendorId only honored for
 * owner/planner -- a non-manager is always scoped to their own vendor).
 */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const vendorId = typeof req.query.vendorId === "string" ? req.query.vendorId : null;
    const scope = typeof req.query.scope === "string" ? req.query.scope : null;
    res.json({
      quantities: await vfq.listVendorFinalQuantities(a, req.params.eventId, { vendorId, scope }),
    });
  }),
);

export default router;
