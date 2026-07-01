/**
 * Divini AI COO V2 - Event Risk rollup routes. Mount base: /api/event-risk.
 *
 * The portfolio-level event risk picture (AI-COO-V2-ROADMAP.md section 3),
 * built by REUSING the existing per-event war-room scanner across the org's
 * active events. Org-scoped and IDOR-safe via the business-health repo
 * (server/src/db/business-health.ts -> rollupOrgEventRisk), which lists only the
 * actor's accessible events and re-checks access per event through
 * server/src/db/warroom.runScan. Mirrors server/src/routes/event-war-room.ts:
 * requireUser, getActor, the h() async wrapper.
 *
 *   GET /portfolio -> { portfolioRiskScore, topRiskyEvents[], criticalCount, warningCount, ... }
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { rollupOrgEventRisk } from "../db/business-health.js";

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

/** Portfolio event-risk rollup across the org's active events. */
router.get(
  "/portfolio",
  h(async (req, res) => {
    const actor = await getActor(req);
    res.json(await rollupOrgEventRisk(actor));
  }),
);

export default router;
