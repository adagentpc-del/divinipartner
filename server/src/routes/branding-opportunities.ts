/**
 * Venue Intelligence - branding opportunity routes. Mount base:
 * /api/branding-opportunities.
 *
 * CRUD over a venue's brandable surfaces. Listing and creation are keyed by
 * venue (?venue=<id> / { venue_id }); get/update/delete are keyed by the
 * opportunity id. Every route is org-scoped and IDOR-safe via the venue-twin
 * repo, which validates the venue against the actor's org. Mirrors
 * server/src/routes/events.ts patterns.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as twin from "../db/venue-twin.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();

/**
 * PUBLIC (no auth): list a published venue's brandable surfaces by profile slug.
 * Powers the "Brand event here" tiles on the public venue profile page. Returns
 * only public-safe fields and only for published profiles. Mounted before the
 * requireUser guard below so it stays unauthenticated.
 */
router.get(
  "/public/:slug",
  h(async (req, res) => {
    res.json({
      opportunities: await twin.listPublicBrandingOpportunitiesBySlug(req.params.slug),
    });
  }),
);

router.use(requireUser);

/** List branding opportunities for a venue (?venue=<id>). */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const venueId = typeof req.query.venue === "string" ? req.query.venue : null;
    if (!venueId) return res.status(400).json({ error: "venue query param required" });
    res.json({ opportunities: await twin.listBrandingOpportunities(a, venueId) });
  }),
);

/** Create a branding opportunity ({ venue_id, name, ... }). */
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
    res
      .status(201)
      .json({ opportunity: await twin.createBrandingOpportunity(a, venueId, body) });
  }),
);

/** Get one branding opportunity. */
router.get(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ opportunity: await twin.getBrandingOpportunity(a, req.params.id) });
  }),
);

/** Patch a branding opportunity. */
router.patch(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({
      opportunity: await twin.updateBrandingOpportunity(a, req.params.id, req.body ?? {}),
    });
  }),
);

/** Delete a branding opportunity. */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    await twin.deleteBrandingOpportunity(a, req.params.id);
    res.status(204).end();
  }),
);

export default router;
