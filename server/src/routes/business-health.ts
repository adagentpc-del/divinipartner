/**
 * Divini AI COO V2 - Business Health Score routes. Mount base: /api/business-health.
 *
 * The ORG-LEVEL executive health score (AI-COO-V2-ROADMAP.md section 3),
 * DISTINCT from the per-entity Divini Score. Every route is org-scoped and
 * IDOR-safe via the business-health repo (server/src/db/business-health.ts),
 * which operates only on the acting user's own organization. Mirrors
 * server/src/routes/divini-score.ts: requireUser, getActor, the h() async
 * wrapper, 403/404 surfaced from the repo errors.
 *
 *   GET  /            -> { org_id, score, components, recommendations, signals, updated_at }
 *   POST /recompute   -> recompute + persist, returns the same shape
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { getHealth, upsertHealth } from "../db/business-health.js";

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

/** Get the org's Business Health Score + component breakdown + recommendations. */
router.get(
  "/",
  h(async (req, res) => {
    const actor = await getActor(req);
    res.json(await getHealth(actor));
  }),
);

/** Recompute (from current org signals) and persist the Business Health Score. */
router.post(
  "/recompute",
  h(async (req, res) => {
    const actor = await getActor(req);
    res.json(await upsertHealth(actor));
  }),
);

export default router;
