/**
 * Intelligence Moat - Feature 4: Revenue Leakage Detection routes.
 * Mount base: /api/revenue-leakage (the lead wires the mount in routes.ts).
 *
 *   POST /scan { scope, id }   run a leakage scan over a venue or event ->
 *                              { scan: {potential, captured, missed, suggestions},
 *                                record }
 *
 * Mirrors the existing route patterns: requireUser guard, getActor via actor(),
 * the h() async wrapper, 400 on bad input, and 403/404 surfaced from the repo's
 * ForbiddenError/NotFoundError. The scan loaders in server/src/db/opportunity.ts
 * authorize the venue/event against the actor's org before any read, so a forged
 * id from another tenant is rejected.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as opp from "../db/opportunity.js";

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

/** Run a revenue leakage scan over a venue or event. */
router.post(
  "/scan",
  h(async (req, res) => {
    const a = await actor(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const scope = body.scope === "venue" || body.scope === "event" ? body.scope : null;
    const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
    if (!scope) return res.status(400).json({ error: "scope must be 'venue' or 'event'" });
    if (!id) return res.status(400).json({ error: "id required" });

    const result =
      scope === "venue"
        ? await opp.scanVenueAndRecord(a, id)
        : await opp.scanEventAndRecord(a, id);
    res.json({ scan: result.scan, record: result.record });
  }),
);

export default router;
