/**
 * Phase 8 - Marketplace routes. Mount base: /api/marketplace.
 *
 * PUBLIC (no auth): search over published profiles (blueprint 38) and the SEO
 * profile reader (blueprint 40). Returns approved, public-only fields. No
 * private pricing, documents, or contact internals are ever serialized here.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import * as marketplace from "../db/marketplace.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get(
  "/meta",
  h(async (_req, res) => {
    res.json({ sorts: marketplace.SORTS, facets: await marketplace.facets() });
  }),
);

router.get(
  "/search",
  h(async (req, res) => {
    const num = (v: unknown): number | undefined => {
      if (v == null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    };
    const results = await marketplace.search({
      q: (req.query.q as string) || undefined,
      kind: (req.query.kind as string) || undefined,
      category: (req.query.category as string) || undefined,
      region: (req.query.region as string) || undefined,
      city: (req.query.city as string) || undefined,
      capacity_min: num(req.query.capacity_min),
      rating_min: num(req.query.rating_min),
      premier: req.query.premier === "true",
      sort: (req.query.sort as string) || undefined,
      limit: num(req.query.limit),
      offset: num(req.query.offset),
      // Phase 4 ranking wire-in (optional). When present, vendor results are
      // ordered by marketplaceRankingScore for this venue; absent = unchanged.
      venueId: (req.query.venueId as string) || undefined,
    });
    res.json({ results });
  }),
);

router.get(
  "/profile/:slug",
  h(async (req, res) => {
    res.json({ profile: await marketplace.seoProfile(req.params.slug) });
  }),
);

export default router;
