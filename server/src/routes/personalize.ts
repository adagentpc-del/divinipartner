/**
 * Landing personalization route. Mount base: /api/personalize (parent mounts).
 *
 * PUBLIC (no auth): resolves a coarse visitor geo and returns the matching hero
 * copy variant for the public landing page. Degrades gracefully to the shipped
 * default copy when there is no geo signal. Never blocks rendering: the
 * frontend shows the static copy immediately and upgrades when this returns.
 *
 * ZERO em dashes in this file (hard rule).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { resolveGeo } from "../lib/geo.js";
import { pickVariant } from "../lib/personalize.js";

const h =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const router = Router();

router.get(
  "/",
  h(async (req, res) => {
    const geo = await resolveGeo(req);
    const variant = pickVariant({ geo, query: req.query as Record<string, unknown> });
    // Short, private cache: personalization is per-visitor, so avoid shared
    // caches but allow the browser to skip a re-fetch on quick re-navigations.
    res.set("Cache-Control", "private, max-age=60");
    res.json({
      variant: variant.variant,
      region: variant.region,
      locale: variant.locale,
      vpn: variant.vpn,
      headline: variant.headline,
      subhead: variant.subhead,
      ctaLabel: variant.ctaLabel,
      secondaryCtaLabel: variant.secondaryCtaLabel,
      emphasis: variant.emphasis,
      source: geo.source,
    });
  }),
);

export default router;
