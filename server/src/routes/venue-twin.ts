/**
 * Venue Intelligence - venue-twin routes. Mount base: /api/venue-twin.
 *
 * The venue twin (get / upsert), its Quote Readiness Score, and its uploaded
 * assets. Every route is org-scoped and IDOR-safe via the venue-twin repo
 * (server/src/db/venue-twin.ts), which validates the venue against the actor's
 * org before any read or write. Mirrors server/src/routes/events.ts patterns:
 * requireUser, getActor, the h() async wrapper, 400 on bad input, 403/404 from
 * the repo's ForbiddenError/NotFoundError.
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

/** Get the venue twin for a venue (null when not started yet). */
router.get(
  "/:venueId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ twin: await twin.getVenueTwin(a, req.params.venueId) });
  }),
);

/** Create or update the venue twin (one row per venue). */
router.put(
  "/:venueId",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ twin: await twin.upsertVenueTwin(a, req.params.venueId, req.body ?? {}) });
  }),
);

/** Quote Readiness Score + per-dimension breakdown for the venue. */
router.get(
  "/:venueId/readiness",
  h(async (req, res) => {
    const a = await actor(req);
    res.json(await twin.getReadiness(a, req.params.venueId));
  }),
);

/** List the venue's assets (optional ?kind= filter). */
router.get(
  "/:venueId/assets",
  h(async (req, res) => {
    const a = await actor(req);
    const kind = typeof req.query.kind === "string" ? req.query.kind : null;
    if (kind && !twin.isAssetKind(kind)) return res.status(400).json({ error: "invalid kind" });
    res.json({
      assets: await twin.listVenueAssets(a, req.params.venueId, kind as twin.VenueAssetKind | null),
    });
  }),
);

/** Add an asset to the venue. */
router.post(
  "/:venueId/assets",
  h(async (req, res) => {
    const a = await actor(req);
    const { kind } = req.body ?? {};
    if (!twin.isAssetKind(kind)) return res.status(400).json({ error: "valid kind required" });
    res.status(201).json({ asset: await twin.addVenueAsset(a, req.params.venueId, req.body) });
  }),
);

/** Delete an asset from the venue. */
router.delete(
  "/:venueId/assets/:assetId",
  h(async (req, res) => {
    const a = await actor(req);
    await twin.deleteVenueAsset(a, req.params.venueId, req.params.assetId);
    res.status(204).end();
  }),
);

export default router;
