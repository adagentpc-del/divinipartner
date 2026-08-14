/**
 * Live Activity Timeline routes (live-ops phase, Part 11-12). Mount base:
 * /api/event-activity.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { listActivity } from "../db/eventActivity.js";

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

/** Role-scoped activity feed for an event, newest first. Visibility is
 *  enforced server-side (lib/activityVisibility.ts) -- never a
 *  client-selectable filter. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json({ activity: await listActivity(a, req.params.eventId, limit) });
  }),
);

export default router;
