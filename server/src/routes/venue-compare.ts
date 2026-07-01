/**
 * Friction Elimination - UPGRADE 3 Venue Comparison Engine routes.
 * Mount base: /api/venue-compare (wired by the integration lead in routes.ts).
 *
 * Two surfaces:
 *   - A venue maintains its comparison attributes (rental, inclusions, F&B
 *     minimum, security/insurance, setup/teardown windows): GET/PUT /:venueId/attrs.
 *     Org-scoped + IDOR-safe via the repo (server/src/db/venue-compare.ts).
 *   - Any authenticated user runs a side-by-side comparison of venues they may
 *     see: POST /compare { venueIds, inputs }. Returns one normalized row per
 *     readable venue, each carrying an Estimated Total Cost.
 *
 * Mirrors server/src/routes/venue-twin.ts: requireUser, getActor, the h() async
 * wrapper, 400 on bad input, 403/404 surfaced from the repo's
 * ForbiddenError/NotFoundError.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as compare from "../db/venue-compare.js";

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

/** Get a venue's comparison attributes (null when not started yet). */
router.get(
  "/:venueId/attrs",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ attrs: await compare.getCompareAttrs(a, req.params.venueId) });
  }),
);

/** Create or update a venue's comparison attributes (one row per venue). */
router.put(
  "/:venueId/attrs",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ attrs: await compare.upsertCompareAttrs(a, req.params.venueId, req.body ?? {}) });
  }),
);

/**
 * Side-by-side comparison of venues. Body: { venueIds: string[], inputs?:
 * { guestCount?: number } }. Readable by any authed user; venues the caller may
 * not see are skipped. Returns { rows: ComparisonRow[] }.
 */
router.post(
  "/compare",
  h(async (req, res) => {
    const a = await actor(req);
    const body = (req.body ?? {}) as { venueIds?: unknown; inputs?: unknown };
    if (!Array.isArray(body.venueIds)) {
      return res.status(400).json({ error: "venueIds array required" });
    }
    const venueIds = body.venueIds.filter((v): v is string => typeof v === "string" && v.length > 0);
    if (venueIds.length === 0) {
      return res.status(400).json({ error: "at least one venueId required" });
    }
    const rawInputs = (body.inputs ?? {}) as { guestCount?: unknown };
    const guestCount =
      typeof rawInputs.guestCount === "number" && Number.isFinite(rawInputs.guestCount)
        ? rawInputs.guestCount
        : null;
    res.json({ rows: await compare.buildComparison(a, venueIds, { guestCount }) });
  }),
);

export default router;
