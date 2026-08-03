/**
 * Divini AI COO V2 - Revenue Intelligence + Forecasting routes.
 * Mount base: /api/revenue-intel  (wired by the lead in routes.ts).
 *
 *   GET /trends    -> deterministic trend insights for the acting org
 *   GET /forecast  -> deterministic forecast for the acting org
 *
 * Both are ORG-SCOPED via the actor (db.getActor); the data-access layer
 * filters every aggregate by the acting org's id, so there is no cross-org
 * exposure (IDOR-safe). Optional ?months=N (3..36) widens the trailing window.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import { getTrendsForActor, getForecastForActor } from "../db/revenue-intel.js";
import { isTopTier, featureLockedPayload } from "../lib/entitlements.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

/** Clamp the requested window to a sane range; default 12 months. */
function windowMonths(req: Request): number {
  const raw = Number(req.query.months);
  if (!Number.isFinite(raw)) return 12;
  return Math.min(36, Math.max(3, Math.round(raw)));
}

const router = Router();
router.use(requireUser);

/** Revenue trend insights (revenue, quote volume, conversion, win rate, deal size, categories).
 *  Pro-exclusive: no role's Free/Plus plan includes advanced reporting/analytics. */
router.get(
  "/trends",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org || !isTopTier(a.org)) {
      return res.status(403).json(featureLockedPayload(a.org ?? { tier: null, type: null }, "Advanced reporting"));
    }
    res.json({ trends: await getTrendsForActor(a, windowMonths(req)) });
  }),
);

/** Deterministic forecast (revenue, bookings, vendor + sponsor demand, occupancy, seasonality, pipeline).
 *  Pro-exclusive: Forecasting only ever appears on a role's top tier. */
router.get(
  "/forecast",
  h(async (req, res) => {
    const a = await actor(req);
    if (!a.org || !isTopTier(a.org)) {
      return res.status(403).json(featureLockedPayload(a.org ?? { tier: null, type: null }, "Forecasting"));
    }
    res.json({ forecast: await getForecastForActor(a, windowMonths(req)) });
  }),
);

export default router;
