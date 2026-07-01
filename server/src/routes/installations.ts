/**
 * Friction Elimination - U14 Installation Management routes.
 * Mount base: /api/installations.
 *
 * The shared venue / vendor / planner timeline for getting a vendor in and out
 * of a venue: arrival, setup window, live progress, completion photos, removal
 * schedule and venue sign-off. All routes require a signed-in user; read needs
 * event access, mutation needs event ownership (enforced in
 * server/src/db/installations.ts). Additive; does not touch event-day files.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as installations from "../db/installations.js";

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

/** Reference data for the UI (status list). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ statuses: installations.INSTALL_STATUSES });
  }),
);

/** List installations on an event. */
router.get(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ installations: await installations.listInstallations(a, req.params.eventId) });
  }),
);

/** Create an installation on an event. */
router.post(
  "/event/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    res
      .status(201)
      .json({ installation: await installations.createInstallation(a, req.params.eventId, req.body ?? {}) });
  }),
);

/** Patch an installation. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ installation: await installations.updateInstallation(a, req.params.id, req.body ?? {}) });
  }),
);

/** Mark live progress (body: { progress, status? }). */
router.post(
  "/:id/progress",
  h(async (req, res) => {
    const a = await actor(req);
    const progress = Number(req.body?.progress);
    if (Number.isNaN(progress)) return res.status(400).json({ error: "progress required" });
    res.json({
      installation: await installations.setProgress(a, req.params.id, progress, req.body?.status ?? null),
    });
  }),
);

/** Venue sign-off (body: { approved }). */
router.post(
  "/:id/venue-approve",
  h(async (req, res) => {
    const a = await actor(req);
    const approved = req.body?.approved !== false; // default to approving
    res.json({ installation: await installations.setVenueApproved(a, req.params.id, approved) });
  }),
);

/** Delete an installation. */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await installations.deleteInstallation(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
