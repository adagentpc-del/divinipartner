/**
 * Divini Business Review routes (build-order slice 12). Mount base: /api/business-review.
 *
 * The ORG-LEVEL executive score, DISTINCT from the per-entity Divini Score.
 * Every route is org-scoped and IDOR-safe via the business-review repo
 * (server/src/db/business-review.ts), which operates only on the acting
 * user's own organization. Mirrors server/src/routes/divini-score.ts:
 * requireUser, getActor, the h() async wrapper, 403/404 surfaced from the
 * repo errors. No tier gate at the route level -- getHealth/upsertHealth
 * shape the response depth (basic/standard/full) themselves per spec section
 * 18, so every tier gets a real (if smaller) response rather than a 403.
 *
 *   GET  /            -> { org_id, depth, score, components, recommendations, signals, systemsSummary, updated_at }
 *   POST /recompute   -> recompute + persist, returns the same shape
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { getHealth, upsertHealth } from "../db/business-review.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function getActor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

/** Get the org's Business Review at the depth its tier earns. */
router.get(
  "/",
  h(async (req, res) => {
    const actor = await getActor(req);
    res.json(await getHealth(actor));
  }),
);

/** Recompute (from current org signals) and persist the Business Review score. */
router.post(
  "/recompute",
  h(async (req, res) => {
    const actor = await getActor(req);
    res.json(await upsertHealth(actor));
  }),
);

export default router;
