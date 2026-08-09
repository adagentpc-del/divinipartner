/**
 * Vendor/staff check-in routes (live-ops phase, Part 7-8). Mount base:
 * /api/check-ins.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as checkIns from "../db/checkIns.js";

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

router.post(
  "/event/:eventId/check-in",
  h(async (req, res) => {
    const a = await actor(req);
    const { userId, assigned_location, source_device, notes } = req.body ?? {};
    res.json({
      check_in: await checkIns.checkIn(a, req.params.eventId, {
        userId,
        assigned_location,
        source_device,
        notes,
      }),
    });
  }),
);

router.post(
  "/event/:eventId/check-out",
  h(async (req, res) => {
    const a = await actor(req);
    const { userId } = req.body ?? {};
    res.json({ check_in: await checkIns.checkOut(a, req.params.eventId, { userId }) });
  }),
);

router.get(
  "/event/:eventId/mine",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ check_in: await checkIns.myCheckInStatus(a, req.params.eventId) });
  }),
);

router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ check_ins: await checkIns.listCheckIns(a, req.params.eventId) });
  }),
);

router.get(
  "/event/:eventId/vendor-arrivals",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ summary: await checkIns.vendorArrivalsSummary(a, req.params.eventId) });
  }),
);

export default router;
