/**
 * Divini Partners - feedback-driven score refresh trigger. Mount base: /scores
 * (the lead wires `router.use("/scores", scoreRefresh)` under /api in routes.ts),
 * so the full path is:
 *   POST /api/scores/refresh   { entityType, entityId }   recompute + persist
 *
 * The review-insert path (db/reviews.ts) ALREADY recomputes the reviewed party's
 * Divini Score on every createReview / submitRequestedReview via
 * lib/score-refresh.ts -> recomputeScoreInternal, so the score the matching engine
 * consumes stays fresh automatically. This endpoint is the EXPLICIT, manual
 * wiring point for the same recompute: a dashboard "refresh my score" button, or
 * any future feedback path, can POST here to force a fresh divini_scores snapshot
 * for one entity.
 *
 * Authorization reuses the per-entity IDOR gate in db/divini-score.ts
 * (upsertScore -> assertEntityAccess): the actor must own the entity (org match
 * or self for planner/client) or be admin. Mirrors the existing route
 * conventions: getAuth, requireUser, the h() async wrapper, 400 on bad input,
 * 403/404 surface from the repo errors. Zero em dashes by convention.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as score from "../db/divini-score.js";
import { isDiviniEntityType } from "../lib/diviniScore.js";

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
 * Recompute + persist the Divini Score for one entity from current signals.
 * Body: { entityType: venue|vendor|planner|sponsor|client, entityId: uuid }.
 * Returns the stored view { entity_type, entity_id, score, components, ... }.
 */
router.post(
  "/refresh",
  h(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const entityType = String(body.entityType ?? "").trim();
    const entityId = String(body.entityId ?? "").trim();
    if (!isDiviniEntityType(entityType)) {
      return res.status(400).json({ error: "valid entityType required" });
    }
    if (!entityId) {
      return res.status(400).json({ error: "entityId required" });
    }
    const a = await actor(req);
    res.json(await score.upsertScore(a, entityType, entityId));
  }),
);

export default router;
