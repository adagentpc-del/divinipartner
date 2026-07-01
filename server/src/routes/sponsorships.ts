/**
 * Venue Intelligence - sponsorship opportunity routes. Mount base:
 * /api/sponsorships.
 *
 * The Sponsorship Inventory Marketplace. Venues manage their packaged
 * sponsorship opportunities (CRUD, keyed by venue for list/create and by id for
 * get/update/delete), and sponsors browse the OPEN opportunities across the
 * marketplace via GET /browse. Management routes are org-scoped and IDOR-safe
 * via the revenue-inventory repo (server/src/db/revenue-inventory.ts); the
 * browse route is read only and intentionally cross-org (status = 'open').
 * Mirrors server/src/routes/branding-opportunities.ts patterns: requireUser,
 * getActor, the h() async wrapper, 400 on bad input, 403/404 from the repo's
 * ForbiddenError/NotFoundError.
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

/**
 * Marketplace browse: OPEN sponsorship opportunities across all venues, for
 * sponsors shopping the marketplace. Optional ?category= filter and ?limit=.
 * Read only; any signed-in user may browse.
 */
router.get(
  "/browse",
  h(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : null;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    res.json({ opportunities: await inv.browseOpenSponsorships(category, limit) });
  }),
);

/** List sponsorship opportunities for a venue (?venue=<id>). */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const venueId = typeof req.query.venue === "string" ? req.query.venue : null;
    if (!venueId) return res.status(400).json({ error: "venue query param required" });
    res.json({ opportunities: await inv.listSponsorshipOpportunities(a, venueId) });
  }),
);

/** Create a sponsorship opportunity ({ venue_id, name, ... }). */
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
    res.status(201).json({ opportunity: await inv.createSponsorshipOpportunity(a, venueId, body) });
  }),
);

/** Get one sponsorship opportunity. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ opportunity: await inv.getSponsorshipOpportunity(a, req.params.id) });
  }),
);

/** Patch a sponsorship opportunity. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({
      opportunity: await inv.updateSponsorshipOpportunity(a, req.params.id, req.body ?? {}),
    });
  }),
);

/** Delete a sponsorship opportunity. */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await inv.deleteSponsorshipOpportunity(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
