/**
 * Event Closeout routes (live-ops phase, Part 25-27). Mount base:
 * /api/closeout.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as closeout from "../db/closeout.js";
import { VENDOR_COMPLETION_STATUSES } from "../db/closeout.js";

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

router.get("/meta", (_req, res) => {
  res.json({ statuses: VENDOR_COMPLETION_STATUSES });
});

router.get(
  "/event/:eventId/readiness",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ readiness: await closeout.computeCloseoutReadiness(a, req.params.eventId) });
  }),
);

router.get(
  "/event/:eventId/vendors",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ vendors: await closeout.listVendorCompletions(a, req.params.eventId) });
  }),
);

router.patch(
  "/event/:eventId/vendors/:vendorOrgId",
  h(async (req, res) => {
    const a = await actor(req);
    const { status, notes } = req.body ?? {};
    res.json({
      vendor: await closeout.markVendorCompletion(a, req.params.eventId, req.params.vendorOrgId, { status, notes }),
    });
  }),
);

export default router;
