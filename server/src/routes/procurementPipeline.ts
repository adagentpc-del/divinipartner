/**
 * Procurement + vendor pipeline routes (front-half completion pass,
 * 2026-08-10). Mount base: /api/procurement-pipeline.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { getEventProcurementPipeline, getVendorPipeline } from "../db/procurementPipeline.js";

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

/** Event owner's procurement pipeline: one row per bid, derived stage. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ pipeline: await getEventProcurementPipeline(a, req.params.eventId) });
  }),
);

/** The acting vendor org's pipeline across every event. */
router.get(
  "/mine",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ opportunities: await getVendorPipeline(a) });
  }),
);

export default router;
