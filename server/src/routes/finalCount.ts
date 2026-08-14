/**
 * Final Count Workflow routes. Mount base: /api/final-count.
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as finalCount from "../db/finalCount.js";

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

/** The current (latest) final count for an event, or null if never set. */
router.get(
  "/event/:eventId/current",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ current: await finalCount.currentFinalCount(a, req.params.eventId) });
  }),
);

/** Full version history, newest first. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ versions: await finalCount.listFinalCountVersions(a, req.params.eventId) });
  }),
);

/** Set (version) the final count. Owner or planner-role member only. */
router.post(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const { count, notes } = req.body ?? {};
    if (typeof count !== "number") return res.status(400).json({ error: "count required" });
    res.status(201).json(await finalCount.setFinalCount(a, req.params.eventId, { count, notes }));
  }),
);

export default router;
