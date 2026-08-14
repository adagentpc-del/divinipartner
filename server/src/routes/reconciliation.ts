/**
 * Event Financial Reconciliation + Settlement routes (live-ops phase,
 * Part 28-31). Mount base: /api/reconciliation.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as reconciliation from "../db/reconciliation.js";

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
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ reconciliation: await reconciliation.computeEventReconciliation(a, req.params.eventId) });
  }),
);

router.get(
  "/event/:eventId/settlement",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ settlement: await reconciliation.getEventSettlement(a, req.params.eventId) });
  }),
);

router.post(
  "/event/:eventId/settle",
  h(async (req, res) => {
    const a = await actor(req);
    const { notes, override } = req.body ?? {};
    res.status(201).json({
      settlement: await reconciliation.markEventSettled(a, req.params.eventId, { notes, override: !!override }),
    });
  }),
);

export default router;
