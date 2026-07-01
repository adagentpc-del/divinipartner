/**
 * Phase 6 - Itinerary routes. Mount base: /api/itinerary.
 *
 * The auto-built itinerary (derived from event + quotes + invoices + persisted
 * items) with role views and deterministic checks, plus CRUD over persisted
 * itinerary_items. Read needs event access, mutation needs event ownership
 * (enforced in server/src/db/itinerary.ts).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as itinerary from "../db/itinerary.js";

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

/** Reference data (categories, statuses, roles). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({
      categories: itinerary.ITINERARY_CATEGORIES,
      statuses: itinerary.ITINERARY_STATUSES,
      roles: itinerary.ITINERARY_ROLES,
    });
  }),
);

/** The auto-built itinerary: items, role views, and deterministic checks. */
router.get(
  "/event/:eventId/build",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ itinerary: await itinerary.buildItinerary(a, req.params.eventId) });
  }),
);

/** Persisted itinerary items on an event. */
router.get(
  "/event/:eventId/items",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ items: await itinerary.listItineraryItems(a, req.params.eventId) });
  }),
);

/** Add a persisted itinerary item. */
router.post(
  "/event/:eventId/items",
  h(async (req, res) => {
    const a = await actor(req);
    res.status(201).json({ item: await itinerary.addItineraryItem(a, req.params.eventId, req.body ?? {}) });
  }),
);

/** Patch a persisted item. */
router.patch(
  "/items/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ item: await itinerary.updateItineraryItem(a, req.params.id, req.body ?? {}) });
  }),
);

/** Delete a persisted item. */
router.delete(
  "/items/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await itinerary.deleteItineraryItem(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
