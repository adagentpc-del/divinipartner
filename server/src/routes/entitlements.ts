/**
 * GET /api/entitlements - the signed-in org's plan, fee rate/cap, and usage
 * limits, for the SPA to render upgrade prompts. Read-only: this endpoint
 * never enforces anything itself (see lib/entitlements.ts checkLimit, called
 * server-side at the point of creation, not here).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { getEntitlements } from "../lib/entitlements.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get(
  "/",
  requireUser,
  h(async (req, res) => {
    const auth = getAuth(req);
    const actor = await db.getActor(auth.userId!, auth.email);
    if (!actor.org) return res.json({ organization: null, entitlements: null });
    res.json({ organization: { id: actor.org.id, tier: actor.org.tier }, entitlements: getEntitlements(actor.org) });
  }),
);

export default router;
