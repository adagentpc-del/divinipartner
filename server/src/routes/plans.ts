/**
 * Public plan catalog. Mounted by the parent at /api/plans. Unauthenticated --
 * this is marketing data (what each of the 7 roles' plans cost and include),
 * the single source of truth the public pricing page and the signup tier
 * picker both read from, so the numbers can never drift between two copies.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { PLAN_CATALOG, ADD_ONS, ENTERPRISE_TRIGGERS } from "../lib/planCatalog.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get(
  "/",
  h(async (_req, res) => {
    res.json({ roles: PLAN_CATALOG, add_ons: ADD_ONS, enterprise_triggers: ENTERPRISE_TRIGGERS });
  }),
);

export default router;
