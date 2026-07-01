/**
 * Intelligence Moat - Divini Score routes. Mount base: /api/divini-score.
 *
 * The proprietary per-entity Divini Score (F12). Every route is org-scoped and
 * IDOR-safe via the divini-score repo (server/src/db/divini-score.ts), which
 * resolves each entity to an owning org / user and validates the actor before
 * any read or recompute. Mirrors server/src/routes/vendor-readiness.ts:
 * requireUser, getActor, the h() async wrapper, 400 on bad input, 403/404 from
 * the repo errors.
 *
 *   GET  /:entityType/:entityId           -> { entity_type, entity_id, score, components, ... }
 *   POST /:entityType/:entityId/recompute -> recompute + persist, returns the same shape
 *   GET  /  (admin)                        -> leaderboard list (?entityType=&limit=)
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

/** Admin leaderboard: cached scores, highest first. Optional ?entityType=&limit=. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    const entityType =
      typeof req.query.entityType === "string" ? req.query.entityType : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    res.json({ scores: await score.listScores(a, entityType, limit) });
  }),
);

/** Get the Divini Score + component breakdown for one entity. */
router.get(
  "/:entityType/:entityId",
  h(async (req, res) => {
    const { entityType, entityId } = req.params;
    if (!isDiviniEntityType(entityType)) {
      return res.status(400).json({ error: "invalid entity type" });
    }
    const a = await actor(req);
    res.json(await score.getScore(a, entityType, entityId));
  }),
);

/** Recompute (from current signals) and persist the Divini Score for one entity. */
router.post(
  "/:entityType/:entityId/recompute",
  h(async (req, res) => {
    const { entityType, entityId } = req.params;
    if (!isDiviniEntityType(entityType)) {
      return res.status(400).json({ error: "invalid entity type" });
    }
    const a = await actor(req);
    res.json(await score.upsertScore(a, entityType, entityId));
  }),
);

export default router;
