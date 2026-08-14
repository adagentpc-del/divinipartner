/**
 * Divini Profit Map. Mounted at /api/profit-map.
 *
 *   GET  /report                 revenue/cost/margin across won jobs, merged
 *                                  from marketplace quotes and accepted proposals
 *   GET  /quotes/:id/cost        the recorded cost for one marketplace quote (or null)
 *   POST /quotes/:id/cost        record/update the cost for a marketplace-quote job
 *   GET  /proposals/:id/cost     the recorded cost for one proposal (or null)
 *   POST /proposals/:id/cost     record/update the cost for a Proposal Studio job
 *
 * Every route is Plus-gated (403 feature_locked below Plus, per spec section
 * 18) via lib/entitlements.ts's isPlusTier -- see db/profitMap.ts for the
 * IDOR + gating logic itself; this file just translates FeatureLockedError
 * into the shared 403 shape the SPA's <UpgradePrompt> understands.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import {
  getProfitMapReport,
  getQuoteCost,
  setQuoteCost,
  getProposalCost,
  setProposalCost,
  FeatureLockedError,
} from "../db/profitMap.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch((err: unknown) => {
      if (err instanceof FeatureLockedError) {
        res.status(403).json(err.payload);
        return;
      }
      next(err);
    });

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

const router = Router();
router.use(requireUser);

router.get(
  "/report",
  h(async (req, res) => {
    const a = await actor(req);
    const months = Number(req.query.months);
    res.json({ report: await getProfitMapReport(a, Number.isFinite(months) ? months : 12) });
  }),
);

router.get(
  "/quotes/:id/cost",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ cost: await getQuoteCost(a, req.params.id) });
  }),
);

router.post(
  "/quotes/:id/cost",
  h(async (req, res) => {
    const a = await actor(req);
    const costAmount = Number(req.body?.cost_amount);
    if (!Number.isFinite(costAmount) || costAmount < 0) {
      return res.status(400).json({ error: "cost_amount must be a non-negative number" });
    }
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const cost = await setQuoteCost(a, req.params.id, costAmount, notes);
    res.status(201).json({ cost });
  }),
);

router.get(
  "/proposals/:id/cost",
  h(async (req, res) => {
    const a = await actor(req);
    res.json({ cost: await getProposalCost(a, req.params.id) });
  }),
);

router.post(
  "/proposals/:id/cost",
  h(async (req, res) => {
    const a = await actor(req);
    const costAmount = Number(req.body?.cost_amount);
    if (!Number.isFinite(costAmount) || costAmount < 0) {
      return res.status(400).json({ error: "cost_amount must be a non-negative number" });
    }
    const notes = typeof req.body?.notes === "string" ? req.body.notes : null;
    const cost = await setProposalCost(a, req.params.id, costAmount, notes);
    res.status(201).json({ cost });
  }),
);

export default router;
