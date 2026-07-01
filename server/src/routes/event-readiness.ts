/**
 * Friction Elimination - U2 Event Readiness Score routes.
 * Mount base: /api/event-readiness.
 *
 * GET /:eventId -> { score, breakdown, missing }
 *   Gathers the seven readiness signals from the existing tables
 *   (db/event-intel.gatherEventReadinessSignals, access-checked / IDOR-safe via
 *   the events repo) and runs the pure scorer
 *   (lib/eventReadiness.computeEventReadiness). No score math lives in the
 *   route or the DB layer.
 *
 * Mirrors server/src/routes/events.ts: requireUser, getActor, the h() async
 * wrapper, 403/404 surfaced from the repo errors.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { gatherEventReadinessSignals } from "../db/event-intel.js";
import { computeEventReadiness } from "../lib/eventReadiness.js";

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

/** Readiness score + breakdown + missing items for an event. */
router.get(
  "/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const signals = await gatherEventReadinessSignals(a, req.params.eventId);
    const result = computeEventReadiness(signals);
    res.json({ ...result, signals });
  }),
);

export default router;
