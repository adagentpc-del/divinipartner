/**
 * Venue Intelligence addendum - Event Recommendation Engine routes.
 * Mount base: /api/recommend (the lead wires the mount in routes.ts).
 *
 * POST / { venueType, eventType, budget, guestCount } -> ranked vendor service
 * categories + sponsor categories. Deterministic and stateless: the engine
 * (server/src/lib/recommend.ts -> recommendForEvent) does no DB work and makes
 * no AI calls, so this route just validates inputs and returns the result.
 *
 * Mirrors the existing route patterns: requireUser guard + the h() async
 * wrapper. The result is not org-specific (it ranks categories, not concrete
 * vendor rows), so no IDOR / party-authorization is required here.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { requireUser } from "../auth.js";
import {
  recommendForEvent,
  RECOMMEND_SERVICE_CATEGORIES,
  RECOMMEND_SPONSOR_CATEGORIES,
  type RecommendInput,
} from "../lib/recommend.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();
router.use(requireUser);

/** Reference data for the recommendation form (category lists). */
router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({
      serviceCategories: RECOMMEND_SERVICE_CATEGORIES,
      sponsorCategories: RECOMMEND_SPONSOR_CATEGORIES,
    });
  }),
);

/** Generate deterministic recommendations for the given event inputs. */
router.post(
  "/",
  h(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const venueType =
      typeof body.venueType === "string" && body.venueType.trim() ? body.venueType.trim() : null;
    const eventType =
      typeof body.eventType === "string" && body.eventType.trim() ? body.eventType.trim() : null;

    let budget: number | null = null;
    if (body.budget != null && body.budget !== "") {
      const b = Number(body.budget);
      if (!Number.isFinite(b) || b < 0) {
        return res.status(400).json({ error: "budget must be a non-negative number" });
      }
      budget = b;
    }

    let guestCount: number | null = null;
    if (body.guestCount != null && body.guestCount !== "") {
      const g = Number(body.guestCount);
      if (!Number.isFinite(g) || g < 0) {
        return res.status(400).json({ error: "guestCount must be a non-negative number" });
      }
      guestCount = Math.round(g);
    }

    const input: RecommendInput = { venueType, eventType, budget, guestCount };
    res.json({ recommendation: recommendForEvent(input) });
  }),
);

export default router;
