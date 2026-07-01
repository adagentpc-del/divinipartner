/**
 * Nonprofit / Charity core - fundraising-events routes. Mount base:
 * /api/fundraising-events.
 *
 * CRUD over a nonprofit org's fundraising events. Every route is org-scoped and
 * IDOR-safe via the fundraising repo (server/src/db/fundraising.ts), which
 * validates each row against the actor's org before any read or write. Mirrors
 * server/src/routes/venue-twin.ts: requireUser, getActor, the h() async wrapper,
 * 400 on bad input, 403/404 from the repo's ForbiddenError/NotFoundError.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as fr from "../db/fundraising.js";

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

/** List the actor org's fundraising events. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ events: await fr.listFundraisingEvents(a) });
  }),
);

/** Get one fundraising event (org-scoped). */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ event: await fr.getFundraisingEvent(a, req.params.id) });
  }),
);

/** Create a fundraising event for the actor's org. */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    if (!body.name || typeof body.name !== "string") {
      return res.status(400).json({ error: "name required" });
    }
    res.status(201).json({ event: await fr.createFundraisingEvent(a, body) });
  }),
);

/** Patch a fundraising event (org-scoped). */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ event: await fr.updateFundraisingEvent(a, req.params.id, req.body ?? {}) });
  }),
);

/** Delete a fundraising event (org-scoped). */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await fr.deleteFundraisingEvent(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
