/**
 * Friction Elimination - Sponsorship Intelligence routes (Upgrade 16). Mount
 * base: /api/sponsorship-intel.
 *
 * U16 surfaces the intelligence behind packaged sponsorships:
 *   - GET  /metrics?opportunity=<id>   read the metrics for one opportunity
 *   - PUT  /metrics                     upsert metrics for one opportunity
 *   - POST /recommend                   deterministic recommendations:
 *       { venueId, venueType?, eventType?, budget?, guestCount?, audience?,
 *         limit? }                      -> rank a venue's own opportunities
 *       { mode: "brand", audience?, budget?, category?, minImpressions?, limit? }
 *                                       -> match open opportunities to a brand
 *
 * Mirrors server/src/routes/sponsorships.ts patterns: requireUser, getActor via
 * actor(), the h() async wrapper, 400 on bad input, 403/404 from the repo's
 * ForbiddenError/NotFoundError. Metrics reads/writes are org-scoped + IDOR-safe;
 * the brand match is read only and intentionally cross-org (open opportunities).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth, requireUser } from "../auth.js";
import * as db from "../db.js";
import * as intel from "../db/sponsorship-intel.js";
import {
  recommendSponsorships,
  matchBrandsToVenues,
  type SponsorshipBrief,
  type BrandBrief,
} from "../lib/sponsorshipIntel.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

async function actor(req: Request): Promise<db.Actor> {
  const auth = getAuth(req);
  return db.getActor(auth.userId!, auth.email);
}

function numOrUndef(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

const router = Router();
router.use(requireUser);

/** Read the metrics for one sponsorship opportunity (?opportunity=<id>). */
router.get(
  "/metrics",
  h(async (req, res) => {
    const a = await actor(req);
    const opportunityId =
      typeof req.query.opportunity === "string" ? req.query.opportunity : null;
    if (!opportunityId) {
      return res.status(400).json({ error: "opportunity query param required" });
    }
    res.json({ metrics: await intel.getMetrics(a, opportunityId) });
  }),
);

/**
 * Upsert metrics for one opportunity. Body:
 * { opportunity_id, impressions?, demographics?, historical_performance?,
 *   revenue?, asset_availability? }
 */
router.put(
  "/metrics",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const opportunityId = body.opportunity_id ?? body.sponsorship_opportunity_id;
    if (!opportunityId || typeof opportunityId !== "string") {
      return res.status(400).json({ error: "opportunity_id required" });
    }
    const metrics = await intel.upsertMetrics(a, opportunityId, {
      impressions: numOrUndef(body.impressions) ?? null,
      demographics: body.demographics,
      historical_performance: body.historical_performance,
      revenue: numOrUndef(body.revenue) ?? null,
      asset_availability: body.asset_availability,
    });
    res.json({ metrics });
  }),
);

/**
 * Deterministic recommendations. Two modes:
 *   - default (event side): { venueId, venueType?, eventType?, budget?,
 *     guestCount?, audience?, limit? } ranks the venue's own opportunities.
 *   - brand side: { mode: "brand", audience?, budget?, category?,
 *     minImpressions?, limit? } matches OPEN opportunities to a brand.
 */
router.post(
  "/recommend",
  h(async (req, res) => {
    const a = await actor(req);
    const body = req.body ?? {};
    const limit = numOrUndef(body.limit);

    if (body.mode === "brand") {
      const brand: BrandBrief = {
        audience: strOrNull(body.audience),
        budget: numOrUndef(body.budget) ?? null,
        category: strOrNull(body.category),
        minImpressions: numOrUndef(body.minImpressions) ?? null,
      };
      const candidates = await intel.openCandidates(strOrNull(body.category), limit);
      return res.json({ ...matchBrandsToVenues(brand, candidates, limit) });
    }

    const venueId = strOrNull(body.venueId ?? body.venue_id);
    if (!venueId) {
      return res.status(400).json({ error: "venueId required for event recommendations" });
    }
    const brief: SponsorshipBrief = {
      venueType: strOrNull(body.venueType),
      eventType: strOrNull(body.eventType),
      budget: numOrUndef(body.budget) ?? null,
      guestCount: numOrUndef(body.guestCount) ?? null,
      audience: strOrNull(body.audience),
    };
    const candidates = await intel.candidatesForVenue(a, venueId);
    res.json({ ...recommendSponsorships(brief, candidates, limit) });
  }),
);

export default router;
