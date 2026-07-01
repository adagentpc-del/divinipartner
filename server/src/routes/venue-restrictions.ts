/**
 * Venue Intelligence - venue restriction routes. Mount base:
 * /api/venue-restrictions.
 *
 * Structured allowed/prohibited rules for a venue (and optionally a single
 * branding opportunity). list / add / delete only in Phase 1. Every route is
 * org-scoped and IDOR-safe via the venue-twin repo, which validates the venue
 * against the actor's org. Mirrors server/src/routes/events.ts patterns.
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
router.use(requireUser);

/**
 * List restrictions for a venue (?venue=<id>), optionally narrowed to a branding
 * opportunity (?opportunity=<id>, which still includes venue-wide rules).
 */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const venueId = typeof req.query.venue === "string" ? req.query.venue : null;
    if (!venueId) return res.status(400).json({ error: "venue query param required" });
    const opp = typeof req.query.opportunity === "string" ? req.query.opportunity : null;
    res.json({ restrictions: await twin.listVenueRestrictionRows(a, venueId, opp) });
  }),
);

/** Add a structured restriction ({ venue_id, rule_type, category, value, ... }). */
router.post(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const venueId = body.venue_id;
    if (!venueId || typeof venueId !== "string") {
      return res.status(400).json({ error: "venue_id required" });
    }
    if (body.rule_type !== "allowed" && body.rule_type !== "prohibited") {
      return res.status(400).json({ error: "rule_type must be 'allowed' or 'prohibited'" });
    }
    res.status(201).json({ restriction: await twin.addVenueRestriction(a, venueId, body) });
  }),
);

/** Delete a restriction (?venue=<id> for scoping). */
router.delete(
  "/:id",
  h(async (req, res) => {
    const a = await actor(req);
    const venueId = typeof req.query.venue === "string" ? req.query.venue : null;
    if (!venueId) return res.status(400).json({ error: "venue query param required" });
    await twin.deleteVenueRestriction(a, venueId, req.params.id);
    res.status(204).end();
  }),
);

export default router;
