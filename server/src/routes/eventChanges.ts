/**
 * Event Change Architecture / Propagation routes. Mount base:
 * /api/event-changes. Every route requires a signed-in user; event access
 * itself is enforced by the underlying db/eventChanges.ts calls (getEvent).
 *
 * Zero em dashes.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as changes from "../db/eventChanges.js";

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

/** The changelog for an event, newest first. Any member with event access, including read_only. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ changes: await changes.listEventChanges(a, req.params.eventId) });
  }),
);

/** Acknowledge a change as the signed-in actor. */
router.post(
  "/:id/acknowledge",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ acknowledgment: await changes.acknowledgeChange(a, req.params.id) });
  }),
);

/** Who has and has not acknowledged a change. */
router.get(
  "/:id/acknowledgments",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ acknowledgments: await changes.acknowledgmentStatus(a, req.params.id) });
  }),
);

export default router;
