/**
 * Venue Intelligence - revenue inventory routes. Mount base:
 * /api/revenue-inventory.
 *
 * CRUD over a venue's monetizable inventory (screens, walls, elevators, pool,
 * rooftop, keycards, VIP, registration, parking, ...). Listing and creation are
 * keyed by venue (?venue=<id> / { venue_id }); get/update/delete are keyed by
 * the item id. Every route is org-scoped and IDOR-safe via the revenue-inventory
 * repo (server/src/db/revenue-inventory.ts), which validates the venue against
 * the actor's org. Mirrors server/src/routes/branding-opportunities.ts patterns:
 * requireUser, getActor, the h() async wrapper, 400 on bad input, 403/404 from
 * the repo's ForbiddenError/NotFoundError.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as inv from "../db/revenue-inventory.js";

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

/** List revenue inventory for a venue (?venue=<id>). */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const venueId = typeof req.query.venue === "string" ? req.query.venue : null;
    if (!venueId) return res.status(400).json({ error: "venue query param required" });
    res.json({ items: await inv.listRevenueInventory(a, venueId) });
  }),
);

/** Create a revenue inventory item ({ venue_id, name, ... }). */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const venueId = body.venue_id;
    if (!venueId || typeof venueId !== "string") {
      return res.status(400).json({ error: "venue_id required" });
    }
    if (!body.name || typeof body.name !== "string") {
      return res.status(400).json({ error: "name required" });
    }
    res.status(201).json({ item: await inv.createRevenueInventory(a, venueId, body) });
  }),
);

/** Get one revenue inventory item. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ item: await inv.getRevenueInventory(a, req.params.id) });
  }),
);

/** Patch a revenue inventory item. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ item: await inv.updateRevenueInventory(a, req.params.id, req.body ?? {}) });
  }),
);

/** Delete a revenue inventory item. */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await inv.deleteRevenueInventory(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
