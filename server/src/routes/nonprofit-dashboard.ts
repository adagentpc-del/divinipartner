/**
 * Nonprofit / Charity core - nonprofit-dashboard route. Mount base:
 * /api/nonprofit-dashboard.
 *
 * A single read endpoint returning the dashboard rollup for the actor's
 * organization: fundraising goal, revenue collected, sponsorship + ticket
 * revenue, net (revenue - budget), sponsor fulfillment status counts, guest
 * count, and overdue tasks. Best-effort + deterministic - the repo degrades
 * gracefully when related tables/rows are absent and never fabricates revenue.
 * Org-scoped + IDOR-safe via the fundraising repo.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as fr from "../db/fundraising.js";

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

/** The nonprofit dashboard rollup for the actor's organization. */
router.get(
  "/",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ dashboard: await fr.getNonprofitDashboard(a) });
  }),
);

export default router;
