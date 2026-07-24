/**
 * Tour Series routes. Mount base: /api/tours (authed) + /api/public/tour (public).
 * Authed ops are IDOR-gated to the tour owner org.
 *
 *   GET    /                         list the org's tours
 *   POST   /                         create a tour { name, description }
 *   GET    /:id                      tour + stops
 *   PATCH  /:id                      update tour (name/description/status)
 *   POST   /:id/stops                add a stop (creates a full event)
 *   DELETE /:id/stops/:eventId       detach a stop
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as tours from "../db/tours.js";

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
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ tours: await tours.listTours(a) });
  }),
);

router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const { name } = req.body ?? {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "name required" });
    res.status(201).json({ tour: await tours.createTour(a, req.body) });
  }),
);

router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json(await tours.getTour(a, req.params.id));
  }),
);

router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ tour: await tours.updateTour(a, req.params.id, req.body ?? {}) });
  }),
);

router.post(
  "/:id/stops",
  h(async (req, res) => {
    const a = await actor(req);
    const { name } = req.body ?? {};
    if (!name || typeof name !== "string") return res.status(400).json({ error: "stop name required" });
    res.status(201).json({ stop: await tours.addStop(a, req.params.id, req.body) });
  }),
);

router.delete(
  "/:id/stops/:eventId",
  h(async (req, res) => {
    const a = await actor(req);
    const ok = await tours.removeStop(a, req.params.id, req.params.eventId);
    if (!ok) return res.status(404).json({ error: "stop not found" });
    res.status(204).end();
  }),
);

export default router;
