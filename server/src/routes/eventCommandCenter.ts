/**
 * Event Command Center routes (live-ops phase, Part 5-6). Mount base:
 * /api/event-command-center -- deliberately NOT /api/command-center, which
 * is already the mount for the unrelated "Divini Command Center" AI COO
 * ask-a-question feature (routes/command-center.ts). Different systems,
 * same generic English name; kept apart to avoid a route collision.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { getCommandCenter } from "../db/eventCommandCenter.js";

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

/** Role-projected Command Center snapshot for an event. Any actor with
 *  event access may call this -- the response itself is narrowed per
 *  audience inside getCommandCenter, never by the caller's choice. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ command_center: await getCommandCenter(a, req.params.eventId) });
  }),
);

export default router;
