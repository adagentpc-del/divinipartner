/**
 * Event Execution Readiness routes. Mount base: /api/readiness.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { computeReadiness } from "../db/readiness.js";

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

/** Deterministic readiness report for an event. Any actor with event access may view it. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ readiness: await computeReadiness(a, req.params.eventId) });
  }),
);

export default router;
